const request = require('supertest');

process.env.SMTP_HOST = 'email-smtp.test.amazonaws.com';
process.env.SMTP_USER = 'user';
process.env.SMTP_PASS = 'pass';
process.env.EMAIL_FROM_ADDRESS = 'hello@orviaerp.com';
process.env.EMAIL_FROM_NAME = 'Orvia ERP';
process.env.EMAIL_SEND_RATE = '1000';

const app = require('../../helpers/app');
const mailer = require('../../../src/api/v1/modules/email-marketing/mailer.service');
const sns = require('../../../src/api/v1/modules/email-marketing/sns.service');
const Subscriber = require('../../../src/api/v1/modules/email-marketing/subscriber.model');
const CampaignRecipient = require('../../../src/api/v1/modules/email-marketing/campaign-recipient.model');
const ContactSubmission = require('../../../src/api/v1/modules/contact/contact.model');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

const sent = [];
let counter = 0;

async function loginAs(role) {
  const payload = buildUserPayload({ role });
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

const audienceOf = (subscribers = true) => ({
  subscribers: { enabled: subscribers },
  enquiries: { enabled: false },
  contacts: { enabled: false },
});

async function waitUntilDone(admin, id) {
  for (let i = 0; i < 100; i += 1) {
    const res = await admin.get(`/api/v1/email/campaigns/${id}`);
    if (res.body.data.status !== 'sending') return res.body.data;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('campaign never finished');
}

const tokenFor = async (email) => (await CampaignRecipient.findOne({ email })).token;

beforeEach(() => {
  // Amazon's certificate isn't reachable in tests; signature checking itself is covered below.
  jest.spyOn(sns, 'verifyMessage').mockResolvedValue();
  sent.length = 0;
  counter = 0;
  mailer.setTransport({
    sendMail: jest.fn(async (message) => {
      if (String(message.to).startsWith('fail')) throw new Error('Mailbox rejected');
      sent.push(message);
      counter += 1;
      return { response: `250 Ok 0100test-${counter}-000000` };
    }),
  });
});

describe('Email marketing: subscribers', () => {
  it('adds, lists, searches, updates and removes subscribers', async () => {
    const admin = await loginAs('admin');
    const added = await admin
      .post('/api/v1/email/subscribers')
      .send({ email: 'Priya@Example.com', name: 'Priya', tags: ['Pharmacy', 'vip'] });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ email: 'priya@example.com', tags: ['pharmacy', 'vip'], status: 'subscribed' });

    expect((await admin.post('/api/v1/email/subscribers').send({ email: 'priya@example.com' })).status).toBe(409);

    const list = await admin.get('/api/v1/email/subscribers?page=1&limit=10&search=priya');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);
    expect((await admin.get('/api/v1/email/subscribers?tag=vip')).body.data).toHaveLength(1);
    expect((await admin.get('/api/v1/email/subscribers?tag=other')).body.data).toHaveLength(0);

    const id = added.body.data._id;
    const patched = await admin.patch(`/api/v1/email/subscribers/${id}`).send({ name: 'Priya S' });
    expect(patched.body.data.name).toBe('Priya S');
    expect((await admin.get('/api/v1/email/subscribers/stats')).body.data).toMatchObject({ total: 1, subscribed: 1 });

    expect((await admin.delete(`/api/v1/email/subscribers/${id}`)).status).toBe(200);
  });

  it('imports a CSV, skipping bad rows and addresses that already exist (never re-subscribing)', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create({ email: 'gone@example.com', status: 'unsubscribed' });

    const res = await admin.post('/api/v1/email/subscribers/import').send({
      csv: 'Email,Name,Tags\na@example.com,Asha,pharmacy;vip\nnot-an-email,Bad,\ngone@example.com,Gone,\nA@example.com,Dup,\nb@example.com,Bela,',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.alreadyExisted).toBe(1);
    expect(res.body.data.invalid).toEqual([{ row: 3, email: 'not-an-email' }]);
    expect((await Subscriber.findOne({ email: 'gone@example.com' })).status).toBe('unsubscribed');
    expect((await Subscriber.findOne({ email: 'a@example.com' })).tags).toEqual(['pharmacy', 'vip']);

    expect((await admin.post('/api/v1/email/subscribers/import').send({ csv: 'name\nNo email col' })).status).toBe(400);
  });

  it('keeps unsubscribed addresses on the list so they are never mailed again', async () => {
    const admin = await loginAs('admin');
    const row = await Subscriber.create({ email: 'stop@example.com', status: 'unsubscribed' });
    const res = await admin.delete(`/api/v1/email/subscribers/${row._id}`);
    expect(res.status).toBe(409);
    expect(await Subscriber.countDocuments({ email: 'stop@example.com' })).toBe(1);
  });
});

describe('Email marketing: templates', () => {
  it('creates, updates and deletes a template', async () => {
    const admin = await loginAs('admin');
    const created = await admin
      .post('/api/v1/email/templates')
      .send({ name: 'Welcome', subject: 'Hi {{name}}', html: '<p>Hello</p>' });
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    const updated = await admin
      .put(`/api/v1/email/templates/${id}`)
      .send({ name: 'Welcome v2', subject: 'Hi', html: '<p>Hello again</p>' });
    expect(updated.body.data.name).toBe('Welcome v2');
    expect((await admin.get('/api/v1/email/templates')).body.data).toHaveLength(1);
    expect((await admin.delete(`/api/v1/email/templates/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/v1/email/templates/${id}`)).status).toBe(404);
  });
});

describe('Email marketing: campaigns', () => {
  async function draft(admin, extra = {}) {
    const res = await admin.post('/api/v1/email/campaigns').send({
      name: 'October offer',
      subject: 'Hello {{first_name}}',
      html: '<html><body><p>Hi {{name}}</p><a href="https://orviaerp.com/offer">Offer</a></body></html>',
      audience: audienceOf(),
      ...extra,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('previews the audience across sources: de-duplicated, minus suppressed', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create([
      { email: 'a@example.com', name: 'A' },
      { email: 'shared@example.com', name: 'Shared' },
      { email: 'stop@example.com', status: 'unsubscribed' },
    ]);
    await request(app).post('/api/v1/enquiries').send({ name: 'Lead One', phone: '9876500001', email: 'shared@example.com' });
    await request(app).post('/api/v1/enquiries').send({ name: 'Lead Two', phone: '9876500002', email: 'stop@example.com' });
    await request(app).post('/api/v1/enquiries').send({ name: 'Lead Three', phone: '9876500003', email: 'lead3@example.com' });
    await ContactSubmission.create({
      name: 'Form Person', email: 'form@example.com', phone: '9876500004', service: 'custom-erp', message: 'Need an ERP',
    });

    const res = await admin.post('/api/v1/email/campaigns/audience-preview').send({
      audience: { subscribers: { enabled: true }, enquiries: { enabled: true }, contacts: { enabled: true } },
    });
    expect(res.body.data).toMatchObject({ total: 4, subscribers: 2, enquiries: 1, contacts: 1, suppressed: 1, duplicates: 1 });

    const onlyTagged = await admin.post('/api/v1/email/campaigns/audience-preview').send({
      audience: { subscribers: { enabled: true, tags: ['nobody'] } },
    });
    expect(onlyTagged.body.data.total).toBe(0);
  });

  it('sends a test email with no tracking, to the address given', async () => {
    const admin = await loginAs('admin');
    const campaign = await draft(admin);
    const res = await admin.post(`/api/v1/email/campaigns/${campaign._id}/test`).send({ to: 'me@example.com' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('me@example.com');
    expect(sent[0].subject).toBe('[Test] Hello Test');
    expect(sent[0].html).not.toContain('/t/o/');
    expect(sent[0].from).toEqual({ name: 'Orvia ERP', address: 'hello@orviaerp.com' });
  });

  it('refuses to send to an empty audience, and when email is not configured', async () => {
    const admin = await loginAs('admin');
    const campaign = await draft(admin);
    expect((await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`)).status).toBe(400);

    await Subscriber.create({ email: 'a@example.com' });
    const saved = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const res = await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    process.env.SMTP_HOST = saved;
    expect(res.status).toBe(503);
  });

  it('sends to everyone, personalised and tracked, and records failures', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create([
      { email: 'asha@example.com', name: 'Asha Rao' },
      { email: 'bela@example.com', name: 'Bela' },
      { email: 'fail@example.com', name: 'Fail' },
    ]);
    const campaign = await draft(admin);

    const start = await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    expect(start.status).toBe(202);
    expect(start.body.data.totalCount).toBe(3);

    const done = await waitUntilDone(admin, campaign._id);
    expect(done).toMatchObject({ status: 'completed', sentCount: 2, failedCount: 1, totalCount: 3 });

    const asha = sent.find((m) => m.to === 'asha@example.com');
    expect(asha.subject).toBe('Hello Asha');
    expect(asha.html).toContain('Hi Asha Rao');
    expect(asha.html).toContain('/api/v1/email/t/o/');
    expect(asha.html).toContain('/api/v1/email/t/c/');
    expect(asha.headers['List-Unsubscribe']).toMatch(/\/api\/v1\/email\/unsubscribe\//);

    const failed = await admin.get(`/api/v1/email/campaigns/${campaign._id}/recipients?status=failed`);
    expect(failed.body.data).toHaveLength(1);
    expect(failed.body.data[0].error).toContain('Mailbox rejected');
    expect(failed.body.data[0].token).toBeUndefined();

    // can't be edited or sent again
    expect((await admin.put(`/api/v1/email/campaigns/${campaign._id}`).send({ name: 'x' })).status).toBe(409);
    expect((await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`)).status).toBe(409);
  });

  it('counts opens and clicks once per person, via public links that need no login', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create({ email: 'asha@example.com', name: 'Asha' });
    const campaign = await draft(admin);
    await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    await waitUntilDone(admin, campaign._id);

    const token = await tokenFor('asha@example.com');
    const html = sent[0].html;
    const click = /href="([^"]*\/t\/c\/[^"]+)"/.exec(html)[1];
    const path = new URL(click).pathname + new URL(click).search;

    const pixel = await request(app).get(`/api/v1/email/t/o/${token}.gif`);
    expect(pixel.status).toBe(200);
    expect(pixel.headers['content-type']).toBe('image/gif');
    await request(app).get(`/api/v1/email/t/o/${token}.gif`);

    const redirect = await request(app).get(path);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe('https://orviaerp.com/offer');
    await request(app).get(path);

    const stats = (await admin.get(`/api/v1/email/campaigns/${campaign._id}`)).body.data;
    expect(stats).toMatchObject({ openCount: 1, clickCount: 1 });
    const row = await CampaignRecipient.findOne({ token });
    expect(row).toMatchObject({ openCount: 2, clickCount: 2 });

    const engaged = await admin.get(`/api/v1/email/campaigns/${campaign._id}/recipients?engaged=clicked`);
    expect(engaged.body.data).toHaveLength(1);
  });

  it('does not redirect to a tampered destination', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create({ email: 'asha@example.com' });
    const campaign = await draft(admin);
    await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    await waitUntilDone(admin, campaign._id);
    const token = await tokenFor('asha@example.com');

    const evil = Buffer.from('https://evil.example/phish').toString('base64url');
    const res = await request(app).get(`/api/v1/email/t/c/${token}?u=${evil}&s=bogus`);
    expect(res.status).toBe(400);
  });

  it('unsubscribe: a GET only asks; the POST unsubscribes everywhere, and later campaigns skip them', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create([{ email: 'asha@example.com', name: 'Asha' }, { email: 'bela@example.com' }]);
    const first = await draft(admin);
    await admin.post(`/api/v1/email/campaigns/${first._id}/send`);
    await waitUntilDone(admin, first._id);
    const token = await tokenFor('asha@example.com');

    const page = await request(app).get(`/api/v1/email/unsubscribe/${token}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Yes, unsubscribe me');
    expect((await Subscriber.findOne({ email: 'asha@example.com' })).status).toBe('subscribed');

    const done = await request(app).post(`/api/v1/email/unsubscribe/${token}`).type('form').send('List-Unsubscribe=One-Click');
    expect(done.status).toBe(200);
    expect(done.text).toContain('unsubscribed');
    expect((await Subscriber.findOne({ email: 'asha@example.com' })).status).toBe('unsubscribed');
    expect((await admin.get(`/api/v1/email/campaigns/${first._id}`)).body.data.unsubscribeCount).toBe(1);

    expect((await request(app).post('/api/v1/email/unsubscribe/not-a-token')).status).toBe(404);

    sent.length = 0;
    const second = await draft(admin, { name: 'Second' });
    await admin.post(`/api/v1/email/campaigns/${second._id}/send`);
    const done2 = await waitUntilDone(admin, second._id);
    expect(done2.totalCount).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(['bela@example.com']);
  });

  it('SNS: a permanent bounce marks the recipient and suppresses the address; a transient one does not', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create([{ email: 'asha@example.com' }, { email: 'bela@example.com' }]);
    const campaign = await draft(admin);
    await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    await waitUntilDone(admin, campaign._id);

    const ashaRow = await CampaignRecipient.findOne({ email: 'asha@example.com' });
    const belaRow = await CampaignRecipient.findOne({ email: 'bela@example.com' });
    const notice = (id, body) =>
      request(app)
        .post('/api/v1/email/sns')
        .set('Content-Type', 'text/plain; charset=UTF-8')
        .send(JSON.stringify({ Type: 'Notification', MessageId: 'm', TopicArn: 't', Message: JSON.stringify({ mail: { messageId: id }, ...body }) }));

    expect(
      (await notice(ashaRow.sesMessageId, { notificationType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [{ diagnosticCode: '550 no such user' }] } })).status
    ).toBe(200);
    await notice(belaRow.sesMessageId, { notificationType: 'Bounce', bounce: { bounceType: 'Transient' } });

    expect((await CampaignRecipient.findById(ashaRow._id)).status).toBe('bounced');
    expect((await CampaignRecipient.findById(belaRow._id)).status).toBe('sent');
    expect((await Subscriber.findOne({ email: 'asha@example.com' })).status).toBe('bounced');
    expect((await Subscriber.findOne({ email: 'bela@example.com' })).status).toBe('subscribed');
    expect((await admin.get(`/api/v1/email/campaigns/${campaign._id}`)).body.data.bounceCount).toBe(1);

    await notice(belaRow.sesMessageId, { notificationType: 'Complaint', complaint: { complaintFeedbackType: 'abuse' } });
    expect((await Subscriber.findOne({ email: 'bela@example.com' })).status).toBe('complained');
  });

  it('SNS: rejects a message whose signature check fails', async () => {
    sns.verifyMessage.mockRejectedValueOnce(Object.assign(new Error('SNS signature does not match'), { statusCode: 403 }));
    const res = await request(app)
      .post('/api/v1/email/sns')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ Type: 'Notification' }));
    expect(res.status).toBe(403);
  });

  it('resumes a campaign that was cut off, finishing only the people still queued', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create([{ email: 'a@example.com' }, { email: 'b@example.com' }]);
    const campaign = await draft(admin);
    await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    await waitUntilDone(admin, campaign._id);

    // simulate a restart mid-send: one recipient goes back to queued, campaign back to sending
    const Campaign = require('../../../src/api/v1/modules/email-marketing/campaign.model');
    await CampaignRecipient.updateOne({ email: 'b@example.com' }, { status: 'queued' });
    await Campaign.updateOne({ _id: campaign._id }, { status: 'sending', sentCount: 1 });
    sent.length = 0;

    const stalled = await admin.get(`/api/v1/email/campaigns/${campaign._id}`);
    expect(stalled.body.data.stalled).toBe(true);
    expect((await admin.post(`/api/v1/email/campaigns/${campaign._id}/resume`)).status).toBe(202);
    const done = await waitUntilDone(admin, campaign._id);
    expect(done).toMatchObject({ status: 'completed', sentCount: 2 });
    expect(sent.map((m) => m.to)).toEqual(['b@example.com']);
  });

  it('deletes a campaign together with its recipients', async () => {
    const admin = await loginAs('admin');
    await Subscriber.create({ email: 'a@example.com' });
    const campaign = await draft(admin);
    await admin.post(`/api/v1/email/campaigns/${campaign._id}/send`);
    await waitUntilDone(admin, campaign._id);
    expect((await admin.delete(`/api/v1/email/campaigns/${campaign._id}`)).status).toBe(200);
    expect(await CampaignRecipient.countDocuments({ campaign: campaign._id })).toBe(0);
  });

  it('reports whether email is configured', async () => {
    const admin = await loginAs('admin');
    const res = await admin.get('/api/v1/email/status');
    expect(res.body.data).toMatchObject({ configured: true, fromEmail: 'hello@orviaerp.com' });
  });
});

describe('Email marketing: access', () => {
  it('is admin-only, except the public tracking / unsubscribe links', async () => {
    const vendor = await loginAs('vendor');
    expect((await vendor.get('/api/v1/email/subscribers')).status).toBe(403);
    expect((await vendor.get('/api/v1/email/campaigns')).status).toBe(403);
    expect((await request(app).get('/api/v1/email/campaigns')).status).toBe(401);
    expect((await request(app).get('/api/v1/email/t/o/unknown.gif')).status).toBe(200);
  });
});
