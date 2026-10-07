const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');
const Enquiry = require('../../../src/api/v1/modules/enquiry/enquiry.model');

async function adminAgent() {
  const payload = buildUserPayload({ role: 'admin' });
  const registered = await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  agent.userId = registered.body.data._id;
  return agent;
}

const lead = (overrides = {}) => ({ name: 'Interested Ira', phone: '9876511111', ...overrides });

describe('"interested" lead status (integration)', () => {
  it('sits between contacted and in-progress in the pipeline order', () => {
    expect(Enquiry.STATUSES).toEqual([
      'new',
      'contacted',
      'interested',
      'in-progress',
      'converted',
      'lost',
      'wrong',
      'closed',
    ]);
  });

  it('can be set when a lead is created', async () => {
    const admin = await adminAgent();
    const res = await admin.post('/api/v1/enquiries').send(lead({ status: 'interested' }));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('interested');
  });

  it('can be set on an existing lead, and the change is logged in the timeline', async () => {
    const admin = await adminAgent();
    const created = await request(app).post('/api/v1/enquiries').send(lead());

    const res = await admin.put(`/api/v1/enquiries/${created.body.data._id}`).send({ status: 'interested' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('interested');

    const change = res.body.data.activities.find((a) => a.type === 'status_changed');
    expect(change).toMatchObject({ statusFrom: 'new', statusTo: 'interested' });
  });

  it('can be filtered on, and is counted in the stats', async () => {
    const admin = await adminAgent();
    await admin.post('/api/v1/enquiries').send(lead({ name: 'Keen Kiran', status: 'interested', phone: '9000000011' }));
    await admin.post('/api/v1/enquiries').send(lead({ name: 'Keen Kavya', status: 'interested', phone: '9000000012' }));
    await admin.post('/api/v1/enquiries').send(lead({ name: 'Just New', phone: '9000000013' }));

    const list = await admin.get('/api/v1/enquiries?status=interested');
    expect(list.body.data.map((e) => e.name).sort()).toEqual(['Keen Kavya', 'Keen Kiran']);

    const stats = (await admin.get('/api/v1/enquiries/stats')).body.data;
    expect(stats.byStatus.interested).toBe(2);
    expect(stats.byStatus.new).toBe(1);
    expect(stats.total).toBe(3);
  });

  it('is accepted by the CSV import in any capitalisation', async () => {
    const admin = await adminAgent();
    const csv = ['Name,Phone,Status', 'Imp One,9111111101,Interested', 'Imp Two,9111111102,INTERESTED', 'Imp Three,9111111103,interested'].join('\n');

    const res = await admin.post('/api/v1/enquiries/import').send({ csv });
    expect(res.body.data.created).toBe(3);

    const list = await admin.get('/api/v1/enquiries?status=interested');
    expect(list.body.data).toHaveLength(3);
  });

  it('is still rejected when the value is not a real status', async () => {
    const admin = await adminAgent();
    const created = await request(app).post('/api/v1/enquiries').send(lead());
    const res = await admin.put(`/api/v1/enquiries/${created.body.data._id}`).send({ status: 'very-interested' });
    expect(res.status).toBe(400);
  });

  it('does not change the status of any existing lead', async () => {
    const admin = await adminAgent();
    await request(app).post('/api/v1/enquiries').send(lead({ phone: '9222222201' }));
    const list = await admin.get('/api/v1/enquiries');
    expect(list.body.data.every((e) => e.status === 'new')).toBe(true);
  });
});
