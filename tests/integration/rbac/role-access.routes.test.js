const request = require('supertest');
const app = require('../../helpers/app');
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

const lead = () => ({ name: 'Jordan Lead', phone: '9876500000' });

// vendor and sales are enquiry-only staff: they can work leads but not delete,
// bulk-import, or touch any other module. Admin can do everything.
describe.each(['vendor', 'sales'])('%s role access (integration)', (role) => {
  it('can list, open, update and add notes to enquiries, and export them', async () => {
    const agent = await loginAs(role);
    const admin = await loginAs('admin');
    const created = await request(app).post('/api/v1/enquiries').send(lead());
    const id = created.body.data._id;
    // Staff only work leads an admin has assigned to them.
    await admin.put(`/api/v1/enquiries/${id}`).send({ assignedTo: agent.userId });

    expect((await agent.get('/api/v1/enquiries')).status).toBe(200);
    expect((await agent.get('/api/v1/enquiries/stats')).status).toBe(200);
    expect((await agent.get('/api/v1/enquiries/export')).status).toBe(200);
    expect((await agent.get(`/api/v1/enquiries/${id}`)).status).toBe(200);
    expect((await agent.put(`/api/v1/enquiries/${id}`).send({ status: 'contacted' })).status).toBe(200);
    expect((await agent.post(`/api/v1/enquiries/${id}/notes`).send({ text: 'Called, will revert' })).status).toBe(200);
  });

  it('records themselves as the creator when adding a lead', async () => {
    const agent = await loginAs(role);
    const res = await agent.post('/api/v1/enquiries').send(lead());
    expect(res.status).toBe(201);
    expect(res.body.data.createdBy).toBeDefined();
  });

  it('cannot delete an enquiry', async () => {
    const agent = await loginAs(role);
    const admin = await loginAs('admin');
    const created = await request(app).post('/api/v1/enquiries').send(lead());
    await admin.put(`/api/v1/enquiries/${created.body.data._id}`).send({ assignedTo: agent.userId });
    const res = await agent.delete(`/api/v1/enquiries/${created.body.data._id}`);
    expect(res.status).toBe(403);
  });

  it('cannot bulk-import enquiries', async () => {
    const agent = await loginAs(role);
    const res = await agent.post('/api/v1/enquiries/import').send({ csv: 'name,phone\nA,9876500001' });
    expect(res.status).toBe(403);
  });

  it('cannot use contacts, WhatsApp, or the users API', async () => {
    const agent = await loginAs(role);
    expect((await agent.get('/api/v1/contacts')).status).toBe(403);
    expect((await agent.get('/api/v1/whatsapp/conversations')).status).toBe(403);
    expect((await agent.get('/api/v1/whatsapp/templates')).status).toBe(403);
    expect((await agent.get('/api/v1/whatsapp/broadcasts')).status).toBe(403);
    expect((await agent.post('/api/v1/whatsapp/broadcasts').send({})).status).toBe(403);
    expect((await agent.get('/api/v1/users')).status).toBe(403);
  });

  it('cannot write blogs, products or categories', async () => {
    const agent = await loginAs(role);
    expect((await agent.post('/api/v1/blogs').send({ title: 'Nope nope', content: 'x'.repeat(30) })).status).toBe(403);
    expect((await agent.post('/api/v1/products').send({ name: 'Nope' })).status).toBe(403);
    expect((await agent.post('/api/v1/categories').send({ name: 'Nope' })).status).toBe(403);
  });
});

describe('admin role access (integration)', () => {
  it('can delete enquiries and reach contacts and WhatsApp', async () => {
    const admin = await loginAs('admin');
    const created = await request(app).post('/api/v1/enquiries').send(lead());

    expect((await admin.delete(`/api/v1/enquiries/${created.body.data._id}`)).status).toBe(200);
    expect((await admin.get('/api/v1/contacts')).status).toBe(200);
    expect((await admin.get('/api/v1/whatsapp/broadcasts')).status).toBe(200);
  });
});

describe('public enquiry form (integration)', () => {
  it('does not record a creator for anonymous submissions and ignores a spoofed createdBy', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .send({ ...lead(), createdBy: '000000000000000000000001' });
    expect(res.status).toBe(201);
    expect(res.body.data.createdBy).toBeUndefined();
  });
});
