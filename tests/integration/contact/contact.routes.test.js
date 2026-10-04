const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function createLoggedInAgent(overrides = {}) {
  const payload = buildUserPayload(overrides);
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

function contactPayload(overrides = {}) {
  return {
    name: 'Jordan Client',
    email: 'jordan@example.com',
    phone: '9876500000',
    service: 'custom-erp',
    message: 'We need a custom ERP for our manufacturing unit, please share a scope and quote.',
    ...overrides,
  };
}

describe('Contact routes (integration)', () => {
  it('POST /contacts is public and defaults status/source', async () => {
    const res = await request(app).post('/api/v1/contacts').send(contactPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('new');
    expect(res.body.data.source).toBe('website-contact-form');
    expect(res.body.message).toMatch(/24 hours/);
  });

  it('POST /contacts requires name, email, phone, service and message', async () => {
    const missingService = await request(app).post('/api/v1/contacts').send(contactPayload({ service: undefined }));
    expect(missingService.status).toBe(400);

    const missingMessage = await request(app).post('/api/v1/contacts').send(contactPayload({ message: undefined }));
    expect(missingMessage.status).toBe(400);

    const shortMessage = await request(app).post('/api/v1/contacts').send(contactPayload({ message: 'too short' }));
    expect(shortMessage.status).toBe(400);
  });

  it('POST /contacts rejects a service not offered on the form', async () => {
    const res = await request(app).post('/api/v1/contacts').send(contactPayload({ service: 'astrology' }));
    expect(res.status).toBe(400);
  });

  it('POST /contacts accepts the optional company/website/budget/timeline fields', async () => {
    const res = await request(app).post('/api/v1/contacts').send(
      contactPayload({
        company: 'Acme Manufacturing',
        companyWebsite: 'https://acme.example.com',
        budget: '2l-5l',
        timeline: 'within-1-month',
      })
    );

    expect(res.status).toBe(201);
    expect(res.body.data.company).toBe('Acme Manufacturing');
    expect(res.body.data.budget).toBe('2l-5l');
    expect(res.body.data.timeline).toBe('within-1-month');
  });

  it('POST /contacts captures IP address and user agent', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('User-Agent', 'Regression-Test-Agent/1.0')
      .send(contactPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.userAgent).toBe('Regression-Test-Agent/1.0');
    expect(res.body.data.ipAddress).toBeTruthy();
  });

  it('GET /contacts requires admin or vendor', async () => {
    const res = await request(app).get('/api/v1/contacts');
    expect(res.status).toBe(401);
  });

  it('GET /contacts/stats returns totals broken down by status and service', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    await request(app).post('/api/v1/contacts').send(contactPayload({ service: 'custom-erp' }));
    await request(app).post('/api/v1/contacts').send(contactPayload({ service: 'custom-erp' }));
    await request(app).post('/api/v1/contacts').send(contactPayload({ service: 'website-design-development' }));

    const res = await agent.get('/api/v1/contacts/stats');

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.byStatus.new).toBe(3);
    expect(res.body.data.byService['custom-erp']).toBe(2);
    expect(res.body.data.byService['website-design-development']).toBe(1);
  });

  it('GET /contacts filters by status and service', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const created = await request(app).post('/api/v1/contacts').send(contactPayload({ service: 'seo-services' }));
    await agent.put(`/api/v1/contacts/${created.body.data._id}`).send({ status: 'converted' });
    await request(app).post('/api/v1/contacts').send(contactPayload({ service: 'custom-erp' }));

    const byStatus = await agent.get('/api/v1/contacts?status=converted');
    expect(byStatus.body.data).toHaveLength(1);
    expect(byStatus.body.data[0].service).toBe('seo-services');

    const byService = await agent.get('/api/v1/contacts?service=custom-erp');
    expect(byService.body.data).toHaveLength(1);
  });

  it('PUT /contacts/:id updates status and lets staff correct submitted details', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const created = await request(app).post('/api/v1/contacts').send(contactPayload());

    const res = await agent.put(`/api/v1/contacts/${created.body.data._id}`).send({
      status: 'contacted',
      budget: '75k-2l',
      timeline: 'asap',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contacted');
    expect(res.body.data.budget).toBe('75k-2l');
  });

  it('POST /contacts/:id/notes adds an internal note', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const created = await request(app).post('/api/v1/contacts').send(contactPayload());

    const res = await agent.post(`/api/v1/contacts/${created.body.data._id}/notes`).send({ text: 'Called, sending proposal Friday' });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toHaveLength(1);
    expect(res.body.data.notes[0].text).toBe('Called, sending proposal Friday');
  });

  it('DELETE /contacts/:id soft-deletes — record survives but drops out of list/get', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const created = await request(app).post('/api/v1/contacts').send(contactPayload());
    const id = created.body.data._id;

    const del = await agent.delete(`/api/v1/contacts/${id}`);
    expect(del.status).toBe(200);

    const getAfter = await agent.get(`/api/v1/contacts/${id}`);
    expect(getAfter.status).toBe(404);

    const raw = await require('mongoose').connection.collection('contactsubmissions').findOne({
      _id: new (require('mongoose').Types.ObjectId)(id),
    });
    expect(raw).toBeTruthy();
    expect(raw.isDeleted).toBe(true);
  });

  it('GET /contacts/export returns a CSV with a header row and one row per submission', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    await request(app).post('/api/v1/contacts').send(contactPayload({ name: 'CSV Export Client' }));

    const res = await agent.get('/api/v1/contacts/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('Name,Email,Phone,Company,Company Website,Service,Budget,Timeline,Message,Status,Received');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('CSV Export Client');
  });
});
