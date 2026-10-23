const request = require('supertest');

process.env.SMTP_HOST = 'email-smtp.test.amazonaws.com';
process.env.SMTP_USER = 'user';
process.env.SMTP_PASS = 'pass';
process.env.EMAIL_FROM_ADDRESS = 'hello@orviaerp.com';

const app = require('../../helpers/app');
const sns = require('../../../src/api/v1/modules/email-marketing/sns.service');
const deliverability = require('../../../src/api/v1/modules/email-marketing/deliverability.controller');
const Subscriber = require('../../../src/api/v1/modules/email-marketing/subscriber.model');
const Campaign = require('../../../src/api/v1/modules/email-marketing/campaign.model');
const CampaignRecipient = require('../../../src/api/v1/modules/email-marketing/campaign-recipient.model');
const EmailEvent = require('../../../src/api/v1/modules/email-marketing/email-event.model');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function loginAs(role) {
  const payload = buildUserPayload({ role });
  const registered = await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  agent.userId = registered.body.data._id;
  return agent;
}

// A campaign that already went out to the given addresses, with SES message ids like SES returns.
async function sentCampaign(admin, emails) {
  const campaign = await Campaign.create({
    name: 'Sent', subject: 'Hi', html: '<p>x</p>', status: 'completed', createdBy: admin.userId,
    totalCount: emails.length, sentCount: emails.length,
  });
  const rows = await CampaignRecipient.insertMany(
    emails.map((email, i) => ({
      campaign: campaign._id, email, source: 'subscribers', token: `tok-${email}`, status: 'sent',
      sesMessageId: `ses-${i}-${email}`, sentAt: new Date(),
    }))
  );
  return { campaign, rows };
}

const post = (payload) =>
  request(app)
    .post('/api/v1/email/sns')
    .set('Content-Type', 'text/plain')
    .send(JSON.stringify({ Type: 'Notification', MessageId: 'm', TopicArn: 't', Message: JSON.stringify(payload) }));

beforeEach(() => {
  jest.spyOn(sns, 'verifyMessage').mockResolvedValue();
});

describe('Email marketing: delivery events from SNS', () => {
  it('records a Delivery event and counts it on the campaign (event-publishing "eventType" format)', async () => {
    const admin = await loginAs('admin');
    const { campaign, rows } = await sentCampaign(admin, ['asha@example.com']);

    const payload = {
      eventType: 'Delivery',
      mail: { messageId: rows[0].sesMessageId },
      delivery: { timestamp: '2026-10-23T08:00:00.000Z', recipients: ['asha@example.com'] },
    };
    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(200); // SNS delivers twice sometimes

    expect(await EmailEvent.countDocuments({ type: 'delivered' })).toBe(1);
    expect((await Campaign.findById(campaign._id)).deliveredCount).toBe(1);
    expect((await CampaignRecipient.findById(rows[0]._id)).deliveredAt).toBeTruthy();
  });

  it('keeps a transient bounce as an event only, and blocks on a permanent one (notificationType format)', async () => {
    const admin = await loginAs('admin');
    const { rows } = await sentCampaign(admin, ['full@example.com', 'gone@example.com']);

    await post({
      notificationType: 'Bounce',
      mail: { messageId: rows[0].sesMessageId },
      bounce: {
        bounceType: 'Transient', bounceSubType: 'MailboxFull', timestamp: '2026-10-23T08:00:00.000Z',
        bouncedRecipients: [{ emailAddress: 'full@example.com', diagnosticCode: 'smtp; 452 mailbox full' }],
      },
    });
    await post({
      notificationType: 'Bounce',
      mail: { messageId: rows[1].sesMessageId },
      bounce: {
        bounceType: 'Permanent', bounceSubType: 'General',
        bouncedRecipients: [{ emailAddress: 'gone@example.com', diagnosticCode: 'smtp; 550 no such user' }],
      },
    });

    const events = await EmailEvent.find({ type: 'bounced' }).sort({ email: 1 });
    expect(events.map((e) => [e.email, e.bounceType, e.bounceSubType])).toEqual([
      ['full@example.com', 'Transient', 'MailboxFull'],
      ['gone@example.com', 'Permanent', 'General'],
    ]);
    expect(await Subscriber.findOne({ email: 'full@example.com' })).toBeNull();
    expect(await Subscriber.findOne({ email: 'gone@example.com' })).toMatchObject({ status: 'bounced', blockSource: 'ses' });
  });

  it('a spam complaint is recorded and blocks the address', async () => {
    const admin = await loginAs('admin');
    const { rows } = await sentCampaign(admin, ['mad@example.com']);
    await post({
      eventType: 'Complaint',
      mail: { messageId: rows[0].sesMessageId },
      complaint: { complaintFeedbackType: 'abuse', complainedRecipients: [{ emailAddress: 'mad@example.com' }] },
    });
    expect(await EmailEvent.countDocuments({ type: 'complained' })).toBe(1);
    expect(await Subscriber.findOne({ email: 'mad@example.com' })).toMatchObject({ status: 'complained' });
  });
});

describe('Email marketing: blocked list', () => {
  it('shows who is blocked and why: unsubscribe link, one-click, SES and manual', async () => {
    const admin = await loginAs('admin');
    const { rows } = await sentCampaign(admin, ['link@example.com', 'click@example.com']);
    await request(app).post(`/api/v1/email/unsubscribe/${rows[0].token}`).type('form').send('');
    await request(app).post(`/api/v1/email/unsubscribe/${rows[1].token}`).type('form').send('List-Unsubscribe=One-Click');
    await Subscriber.create({ email: 'bounced@example.com', status: 'bounced', blockSource: 'ses', statusChangedAt: new Date() });
    await admin.post('/api/v1/email/blocked').send({ email: 'Manual@Example.com', note: 'asked by phone' });

    const res = await admin.get('/api/v1/email/blocked');
    const byEmail = Object.fromEntries(res.body.data.map((r) => [r.email, r]));
    expect(byEmail['link@example.com']).toMatchObject({ reason: 'unsubscribed', source: 'link', locked: false });
    expect(byEmail['click@example.com']).toMatchObject({ reason: 'unsubscribed', source: 'one-click' });
    expect(byEmail['bounced@example.com']).toMatchObject({ reason: 'bounced', source: 'ses', locked: true });
    expect(byEmail['manual@example.com']).toMatchObject({ reason: 'blocked', source: 'manual', note: 'asked by phone' });

    expect((await admin.get('/api/v1/email/blocked?reason=bounced')).body.data).toHaveLength(1);
    expect((await admin.get('/api/v1/email/blocked?search=click')).body.data).toHaveLength(1);
    expect((await admin.get('/api/v1/email/blocked?page=1&limit=2')).body.meta).toMatchObject({ total: 4, totalPages: 2 });
  });

  it('a manually blocked address is skipped by campaigns, and blocking twice is refused', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create({ email: 'keep@example.com' });
    await Subscriber.create({ email: 'nope@example.com' });
    expect((await admin.post('/api/v1/email/blocked').send({ email: 'nope@example.com' })).status).toBe(201);
    expect((await admin.post('/api/v1/email/blocked').send({ email: 'nope@example.com' })).status).toBe(409);

    const preview = await admin
      .post('/api/v1/email/campaigns/audience-preview')
      .send({ audience: { subscribers: { enabled: true } } });
    expect(preview.body.data).toMatchObject({ total: 1, subscribers: 1 });
  });

  it('can lift an unsubscribed / blocked address, but never a bounce or complaint', async () => {
    const admin = await loginAs('admin');
    const manual = await admin.post('/api/v1/email/blocked').send({ email: 'lift@example.com' });
    const bounced = await Subscriber.create({ email: 'b@example.com', status: 'bounced' });
    const complained = await Subscriber.create({ email: 'c@example.com', status: 'complained' });

    expect((await admin.delete(`/api/v1/email/blocked/${manual.body.data._id}`)).status).toBe(200);
    expect(await Subscriber.countDocuments({ email: 'lift@example.com' })).toBe(0);

    expect((await admin.delete(`/api/v1/email/blocked/${bounced._id}`)).status).toBe(409);
    expect((await admin.delete(`/api/v1/email/blocked/${complained._id}`)).status).toBe(409);
    expect((await admin.delete('/api/v1/email/blocked/not-an-id')).status).toBe(404);
  });

  it('is admin-only', async () => {
    const sales = await loginAs('sales');
    expect((await sales.get('/api/v1/email/blocked')).status).toBe(403);
    expect((await sales.get('/api/v1/email/deliverability')).status).toBe(403);
  });
});

describe('Email marketing: deliverability', () => {
  it('grades only once there are enough sends, against the 2% bounce / 0.05% complaint targets', () => {
    expect(deliverability.grade({ sent: 99, bounceRate: 50, complaintRate: 5 })).toBe('unknown');
    expect(deliverability.grade({ sent: 1000, bounceRate: 0.5, complaintRate: 0 })).toBe('good');
    expect(deliverability.grade({ sent: 1000, bounceRate: 2, complaintRate: 0 })).toBe('warning');
    expect(deliverability.grade({ sent: 1000, bounceRate: 0, complaintRate: 0.05 })).toBe('warning');
    expect(deliverability.grade({ sent: 1000, bounceRate: 5, complaintRate: 0 })).toBe('bad');
    expect(deliverability.grade({ sent: 1000, bounceRate: 0, complaintRate: 0.1 })).toBe('bad');
  });

  it('summarises the last 7 days and says when SNS events are not connected yet', async () => {
    const admin = await loginAs('admin');
    const empty = await admin.get('/api/v1/email/deliverability');
    expect(empty.body.data).toMatchObject({ sent: 0, delivered: 0, health: 'unknown', eventsConnected: false });

    const { rows } = await sentCampaign(admin, ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']);
    const now = new Date();
    await EmailEvent.create([
      { type: 'delivered', email: 'a@example.com', sesMessageId: rows[0].sesMessageId, occurredAt: now },
      { type: 'delivered', email: 'b@example.com', sesMessageId: rows[1].sesMessageId, occurredAt: now },
      { type: 'bounced', bounceType: 'Permanent', email: 'c@example.com', sesMessageId: rows[2].sesMessageId, occurredAt: now },
      { type: 'bounced', bounceType: 'Transient', email: 'd@example.com', sesMessageId: rows[3].sesMessageId, occurredAt: now },
      { type: 'complained', email: 'a@example.com', sesMessageId: rows[0].sesMessageId, occurredAt: now },
      // older than the 7-day window: must not count
      { type: 'delivered', email: 'old@example.com', sesMessageId: 'old', occurredAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
    ]);

    const res = await admin.get('/api/v1/email/deliverability');
    expect(res.body.data).toMatchObject({
      sent: 4, delivered: 2, hardBounces: 1, softBounces: 1, complaints: 1,
      bounceRate: 25, complaintRate: 25, health: 'unknown', eventsConnected: true,
    });
  });

  it('lists recent delivery events, newest first, filterable by kind', async () => {
    const admin = await loginAs('admin');
    await EmailEvent.create([
      { type: 'delivered', email: 'a@example.com', sesMessageId: 's1', occurredAt: new Date('2026-10-23T08:00:00Z') },
      { type: 'bounced', bounceType: 'Permanent', email: 'b@example.com', sesMessageId: 's2', detail: '550 no such user', occurredAt: new Date('2026-10-23T09:00:00Z') },
    ]);
    const all = await admin.get('/api/v1/email/deliverability/events');
    expect(all.body.data.map((e) => e.email)).toEqual(['b@example.com', 'a@example.com']);
    expect(all.body.meta.total).toBe(2);
    const bounces = await admin.get('/api/v1/email/deliverability/events?type=bounced');
    expect(bounces.body.data).toHaveLength(1);
    expect(bounces.body.data[0].detail).toBe('550 no such user');
  });
});
