const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');
const Enquiry = require('../../../src/api/v1/modules/enquiry/enquiry.model');

async function loginAs(role, overrides = {}) {
  const payload = buildUserPayload({ role, ...overrides });
  const registered = await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  agent.userId = registered.body.data._id;
  return agent;
}

const lead = (overrides = {}) => ({ name: 'Jordan Lead', phone: '9876500000', ...overrides });
const publicLead = async (overrides) => (await request(app).post('/api/v1/enquiries').send(lead(overrides))).body.data;

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

describe('Lead assignment & visibility (integration)', () => {
  it('an admin sees every lead; staff see only the ones assigned to them', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const vendor = await loginAs('vendor');
    const [a, b, c] = [await publicLead({ name: 'Lead A' }), await publicLead({ name: 'Lead B' }), await publicLead({ name: 'Lead C' })];

    await admin.put(`/api/v1/enquiries/${a._id}`).send({ assignedTo: sales.userId });
    await admin.put(`/api/v1/enquiries/${b._id}`).send({ assignedTo: vendor.userId });

    expect((await admin.get('/api/v1/enquiries')).body.data).toHaveLength(3);
    expect((await sales.get('/api/v1/enquiries')).body.data.map((e) => e.name)).toEqual(['Lead A']);
    expect((await vendor.get('/api/v1/enquiries')).body.data.map((e) => e.name)).toEqual(['Lead B']);
    expect(c._id).toBeDefined();
  });

  it('a lead that is not assigned to you looks like it does not exist (404), for every action', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const other = await loginAs('vendor');
    const mine = await publicLead({ name: 'Mine' });
    await admin.put(`/api/v1/enquiries/${mine._id}`).send({ assignedTo: other.userId });

    expect((await sales.get(`/api/v1/enquiries/${mine._id}`)).status).toBe(404);
    expect((await sales.put(`/api/v1/enquiries/${mine._id}`).send({ status: 'contacted' })).status).toBe(404);
    expect((await sales.post(`/api/v1/enquiries/${mine._id}/notes`).send({ text: 'hello there' })).status).toBe(404);
    expect((await sales.post(`/api/v1/enquiries/${mine._id}/followup/complete`).send({})).status).toBe(404);
    expect((await admin.get(`/api/v1/enquiries/${mine._id}`)).status).toBe(200);
  });

  it('stats, export and search are limited to the staff member\'s own leads too', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const mine = await publicLead({ name: 'Visible Vera', phone: '9000000001' });
    await publicLead({ name: 'Hidden Hank', phone: '9000000002' });
    await admin.put(`/api/v1/enquiries/${mine._id}`).send({ assignedTo: sales.userId });

    const stats = await sales.get('/api/v1/enquiries/stats');
    expect(stats.body.data.total).toBe(1);
    expect(stats.body.data.byStatus.new).toBe(1);

    const csv = await sales.get('/api/v1/enquiries/export');
    expect(csv.text).toContain('Visible Vera');
    expect(csv.text).not.toContain('Hidden Hank');

    const search = await sales.get('/api/v1/enquiries?search=Hank');
    expect(search.body.data).toHaveLength(0);
  });

  it('staff cannot widen their view by passing an assignedTo filter', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const other = await loginAs('vendor');
    const theirs = await publicLead();
    await admin.put(`/api/v1/enquiries/${theirs._id}`).send({ assignedTo: other.userId });

    const res = await sales.get(`/api/v1/enquiries?assignedTo=${other.userId}`);
    expect(res.body.data).toHaveLength(0);
    expect((await sales.get('/api/v1/enquiries?assignedTo=unassigned')).body.data).toHaveLength(0);
  });

  it('pagination totals respect the visibility scope', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    for (let i = 0; i < 4; i += 1) {
      const l = await publicLead({ name: `L${i}`, phone: `90000000${i}0` });
      if (i < 3) await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });
    }
    const res = await sales.get('/api/v1/enquiries?page=1&limit=2');
    expect(res.body.meta).toMatchObject({ total: 3, totalPages: 2 });
  });

  it('only an admin can assign or reassign a lead', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const vendor = await loginAs('vendor');
    const l = await publicLead();
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });

    const stealing = await sales.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: vendor.userId });
    expect(stealing.status).toBe(403);
    const dropping = await sales.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: null });
    expect(dropping.status).toBe(403);

    const stillMine = await sales.get(`/api/v1/enquiries/${l._id}`);
    expect(stillMine.body.data.assignedTo._id).toBe(sales.userId);
  });

  it('staff can still change status and details on their own leads', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const l = await publicLead();
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });

    const res = await sales.put(`/api/v1/enquiries/${l._id}`).send({ status: 'contacted', city: 'Pune' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contacted');
    expect(res.body.data.assignedTo._id).toBe(sales.userId);
  });

  it('admin can reassign to any role and unassign', async () => {
    const admin = await loginAs('admin');
    const l = await publicLead();
    for (const role of ['vendor', 'sales', 'user', 'admin']) {
      const target = await loginAs(role);
      const res = await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: target.userId });
      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo._id).toBe(target.userId);
    }
    const cleared = await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: null });
    expect(cleared.body.data.assignedTo).toBeNull();
  });

  it('rejects assigning to a missing or inactive user', async () => {
    const admin = await loginAs('admin');
    const l = await publicLead();
    expect((await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: '000000000000000000000000' })).status).toBe(400);

    const blocked = await loginAs('sales');
    await admin.put(`/api/v1/users/${blocked.userId}`).send({ status: 'inactive' });
    const res = await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: blocked.userId });
    expect(res.status).toBe(400);
  });

  it('admin can filter by assignee and by the unassigned pool', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const a = await publicLead({ name: 'Assigned' });
    await publicLead({ name: 'Floating' });
    await admin.put(`/api/v1/enquiries/${a._id}`).send({ assignedTo: sales.userId });

    expect((await admin.get(`/api/v1/enquiries?assignedTo=${sales.userId}`)).body.data.map((e) => e.name)).toEqual(['Assigned']);
    expect((await admin.get('/api/v1/enquiries?assignedTo=unassigned')).body.data.map((e) => e.name)).toEqual(['Floating']);
  });

  describe('who a new lead is assigned to', () => {
    it('public form submissions start unassigned and ignore a spoofed assignedTo', async () => {
      const sales = await loginAs('sales');
      const l = await publicLead({ assignedTo: sales.userId });
      expect(l.assignedTo).toBeUndefined();
    });

    it('a lead added by staff is assigned to them, so they can see it', async () => {
      const sales = await loginAs('sales');
      const other = await loginAs('vendor');
      const res = await sales.post('/api/v1/enquiries').send(lead({ assignedTo: other.userId }));
      expect(res.status).toBe(201);
      expect(res.body.data.assignedTo).toBe(sales.userId);
      expect((await sales.get('/api/v1/enquiries')).body.data).toHaveLength(1);
    });

    it('an admin can assign while adding the lead', async () => {
      const admin = await loginAs('admin');
      const sales = await loginAs('sales');
      const res = await admin.post('/api/v1/enquiries').send(lead({ assignedTo: sales.userId }));
      expect(res.status).toBe(201);
      expect(res.body.data.assignedTo).toBe(sales.userId);
      expect((await sales.get('/api/v1/enquiries')).body.data).toHaveLength(1);
    });

    it('rejects an admin assigning a new lead to a nonexistent user', async () => {
      const admin = await loginAs('admin');
      const res = await admin.post('/api/v1/enquiries').send(lead({ assignedTo: '000000000000000000000000' }));
      expect(res.status).toBe(400);
    });
  });
});

describe('Lead activity timeline (integration)', () => {
  const detail = async (agent, id) => (await agent.get(`/api/v1/enquiries/${id}`)).body.data;

  it('records creation, assignment and status changes with who did them', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const l = await publicLead();
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });
    await sales.put(`/api/v1/enquiries/${l._id}`).send({ status: 'contacted' });

    const { activities } = await detail(admin, l._id);
    expect(activities.map((a) => a.type)).toEqual(['created', 'assigned', 'status_changed']);
    expect(activities[0].actor).toBeUndefined(); // website form
    expect(activities[1].actor._id).toBe(admin.userId);
    expect(activities[1].assignedTo._id).toBe(sales.userId);
    expect(activities[1].assignedFrom).toBeFalsy(); // nobody before
    expect(activities[2]).toMatchObject({ statusFrom: 'new', statusTo: 'contacted' });
    expect(activities[2].actor._id).toBe(sales.userId);
  });

  it('records reassignment from one person to another', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const vendor = await loginAs('vendor');
    const l = await publicLead();
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: vendor.userId });

    const { activities } = await detail(admin, l._id);
    const last = activities[activities.length - 1];
    expect(last.assignedFrom._id).toBe(sales.userId);
    expect(last.assignedTo._id).toBe(vendor.userId);
  });

  it('does not log anything when an update changes nothing relevant', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const l = await publicLead();
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId, status: 'new', city: 'Pune' });

    expect((await detail(admin, l._id)).activities.map((a) => a.type)).toEqual(['created', 'assigned']);
  });

  it('records the creator on leads staff add themselves', async () => {
    const sales = await loginAs('sales');
    const res = await sales.post('/api/v1/enquiries').send(lead());
    const { activities } = await detail(sales, res.body.data._id);
    expect(activities[0]).toMatchObject({ type: 'created' });
    expect(activities[0].actor._id).toBe(sales.userId);
  });

  it('keeps the activity log out of the list payload', async () => {
    const admin = await loginAs('admin');
    await publicLead();
    const list = await admin.get('/api/v1/enquiries');
    expect(list.body.data[0].activities).toBeUndefined();
  });
});

describe('Remarks and follow-ups (integration)', () => {
  async function assignedPair() {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const l = await publicLead();
    await admin.put(`/api/v1/enquiries/${l._id}`).send({ assignedTo: sales.userId });
    return { admin, sales, id: l._id };
  }

  it('a remark without a follow-up does not schedule one', async () => {
    const { sales, id } = await assignedPair();
    const res = await sales.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'Spoke to them, interested' });
    expect(res.status).toBe(200);
    expect(res.body.data.notes).toHaveLength(1);
    expect(res.body.data.notes[0].followUpAt).toBeUndefined();
    expect(res.body.data.nextFollowUpAt).toBeUndefined();
  });

  it('a remark can schedule a follow-up, which becomes the lead\'s next follow-up', async () => {
    const { sales, id } = await assignedPair();
    const when = inDays(2);
    const res = await sales.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'Call back Friday', followUpAt: when });
    expect(res.status).toBe(200);
    expect(new Date(res.body.data.nextFollowUpAt).toISOString()).toBe(when);
    expect(new Date(res.body.data.notes[0].followUpAt).toISOString()).toBe(when);
    expect(res.body.data.notes[0].addedBy._id).toBe(sales.userId);
  });

  it('a newer follow-up replaces the pending one', async () => {
    const { sales, id } = await assignedPair();
    await sales.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'First', followUpAt: inDays(1) });
    const later = inDays(5);
    const res = await sales.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'Pushed out', followUpAt: later });
    expect(new Date(res.body.data.nextFollowUpAt).toISOString()).toBe(later);
    expect(res.body.data.notes).toHaveLength(2);
  });

  it('rejects an invalid follow-up date', async () => {
    const { sales, id } = await assignedPair();
    const res = await sales.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'x', followUpAt: 'next friday' });
    expect(res.status).toBe(400);
  });

  it('marking a follow-up done clears it and logs who did it', async () => {
    const { admin, sales, id } = await assignedPair();
    const when = inDays(1);
    await sales.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'Call tomorrow', followUpAt: when });

    const res = await sales.post(`/api/v1/enquiries/${id}/followup/complete`).send({ text: 'Called, sending quote' });
    expect(res.status).toBe(200);
    expect(res.body.data.nextFollowUpAt).toBeUndefined();

    const { activities } = (await admin.get(`/api/v1/enquiries/${id}`)).body.data;
    const done = activities.find((a) => a.type === 'followup_done');
    expect(done.actor._id).toBe(sales.userId);
    expect(done.text).toBe('Called, sending quote');
    expect(new Date(done.followUpAt).toISOString()).toBe(when);
  });

  it('completing when nothing is pending is a 400, not a silent success', async () => {
    const { sales, id } = await assignedPair();
    const res = await sales.post(`/api/v1/enquiries/${id}/followup/complete`).send({});
    expect(res.status).toBe(400);
  });

  it('buckets follow-ups into overdue / today / upcoming and filters by them', async () => {
    const admin = await loginAs('admin');
    const mk = async (name, followUpAt) => {
      const l = await publicLead({ name, phone: `9${Math.floor(Math.random() * 1e9)}` });
      await Enquiry.updateOne({ _id: l._id }, { nextFollowUpAt: followUpAt });
      return l;
    };
    await mk('Overdue', new Date(Date.now() - 3 * DAY));
    await mk('Later', new Date(Date.now() + 3 * DAY));
    await mk('None', undefined);

    const stats = (await admin.get('/api/v1/enquiries/stats')).body.data;
    expect(stats.followUps.overdue).toBe(1);
    expect(stats.followUps.upcoming).toBe(1);

    expect((await admin.get('/api/v1/enquiries?followUp=overdue')).body.data.map((e) => e.name)).toEqual(['Overdue']);
    expect((await admin.get('/api/v1/enquiries?followUp=upcoming')).body.data.map((e) => e.name)).toEqual(['Later']);
    expect((await admin.get('/api/v1/enquiries?followUp=pending')).body.data).toHaveLength(2);
  });

  it('staff only see their own follow-up counts', async () => {
    const admin = await loginAs('admin');
    const sales = await loginAs('sales');
    const mine = await publicLead({ name: 'Mine', phone: '9111111111' });
    const theirs = await publicLead({ name: 'Theirs', phone: '9222222222' });
    await admin.put(`/api/v1/enquiries/${mine._id}`).send({ assignedTo: sales.userId });
    await Enquiry.updateMany({ _id: { $in: [mine._id, theirs._id] } }, { nextFollowUpAt: new Date(Date.now() - 2 * DAY) });

    expect((await sales.get('/api/v1/enquiries/stats')).body.data.followUps.overdue).toBe(1);
    expect((await admin.get('/api/v1/enquiries/stats')).body.data.followUps.overdue).toBe(2);
  });
});

describe('Follow-up day boundaries (unit)', () => {
  const { dayBounds } = require('../../../src/api/v1/modules/enquiry/enquiry.service');
  const now = new Date('2026-10-05T20:00:00.000Z');

  it('uses the UTC calendar day when the caller is in UTC', () => {
    const { start, end } = dayBounds(0, now);
    expect(start.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-05T23:59:59.999Z');
  });

  it('shifts to the caller own day for IST (UTC+5:30): 20:00 UTC is already 6 Oct there', () => {
    const { start, end } = dayBounds(-330, now);
    expect(start.toISOString()).toBe('2026-10-05T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-06T18:29:59.999Z');
  });

  it('handles callers behind UTC (US Pacific, UTC-7): 20:00 UTC is still the morning of 5 Oct', () => {
    const { start, end } = dayBounds(420, now);
    expect(start.toISOString()).toBe('2026-10-05T07:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-06T06:59:59.999Z');
  });
});
