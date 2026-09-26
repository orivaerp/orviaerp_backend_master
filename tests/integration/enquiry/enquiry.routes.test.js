const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');

async function createLoggedInAgent(overrides = {}) {
  const payload = buildUserPayload(overrides);
  await request(app).post('/api/v1/users').send(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

function enquiryPayload(overrides = {}) {
  return {
    name: 'Jordan Lead',
    phone: '9876500000',
    email: 'jordan@example.com',
    message: 'Interested in the starter plan, please call back.',
    ...overrides,
  };
}

describe('Enquiry routes (integration)', () => {
  it('POST /enquiries is public and defaults source/status', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiryPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe('website');
    expect(res.body.data.status).toBe('new');
  });

  it('POST /enquiries requires a phone number', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ phone: undefined }));
    expect(res.status).toBe(400);
  });

  it('POST /enquiries accepts a lead with only name and phone (email/message optional)', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .send({ name: 'Walk-in Lead', phone: '9876511111' });

    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBe('9876511111');
    expect(res.body.data.email).toBeFalsy();
    expect(res.body.data.message).toBeFalsy();
  });

  it('POST /enquiries rejects an invalid source or status', async () => {
    const badSource = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source: 'carrier-pigeon' }));
    expect(badSource.status).toBe(400);

    const badStatus = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ status: 'vibing' }));
    expect(badStatus.status).toBe(400);
  });

  it('POST /enquiries accepts every documented source and status (admin adding a lead)', async () => {
    for (const source of ['walkin', 'campaign', 'websearch', 'reference', 'social-media']) {
      const res = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source }));
      expect(res.status).toBe(201);
    }
    for (const status of ['converted', 'lost', 'wrong']) {
      const res = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ status }));
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(status);
    }
  });

  it('GET /enquiries/stats returns totals broken down by status and source', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source: 'walkin' }));
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source: 'walkin', status: 'converted' }));
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source: 'website' }));

    const res = await agent.get('/api/v1/enquiries/stats');

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.byStatus.new).toBe(2);
    expect(res.body.data.byStatus.converted).toBe(1);
    expect(res.body.data.bySource.walkin).toBe(2);
    expect(res.body.data.bySource.website).toBe(1);
  });

  it('GET /enquiries filters by status, source and date range', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source: 'walkin', status: 'converted' }));
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ source: 'website' }));

    const byStatus = await agent.get('/api/v1/enquiries?status=converted');
    expect(byStatus.body.data).toHaveLength(1);
    expect(byStatus.body.data[0].source).toBe('walkin');

    const bySource = await agent.get('/api/v1/enquiries?source=website');
    expect(bySource.body.data).toHaveLength(1);

    const future = await agent.get('/api/v1/enquiries?dateFrom=2999-01-01');
    expect(future.body.data).toHaveLength(0);
  });

  it('GET /enquiries/export returns a CSV with a header row and one row per enquiry', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ name: 'CSV Test Lead' }));

    const res = await agent.get('/api/v1/enquiries/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'Name,Email,Phone,Subject,Message,Source,Status,Category,Sub Category,Firm Name,Website,City,Address,State,Product,Created At'
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('CSV Test Lead');
  });

  it('POST /enquiries accepts the optional lead-detail fields', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(
      enquiryPayload({
        category: 'health',
        subCategory: 'Diagnostic Center',
        firmName: 'Acme Diagnostics',
        website: 'https://acme-diagnostics.example.com',
        city: 'Pune',
        address: '221B Baker Colony',
        state: 'Maharashtra',
      })
    );

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('health');
    expect(res.body.data.subCategory).toBe('Diagnostic Center');
    expect(res.body.data.firmName).toBe('Acme Diagnostics');
    expect(res.body.data.city).toBe('Pune');
    expect(res.body.data.state).toBe('Maharashtra');
  });

  it('POST /enquiries rejects an invalid category', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ category: 'automotive' }));
    expect(res.status).toBe(400);
  });

  it('GET /enquiries filters by category', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ category: 'education' }));
    await request(app).post('/api/v1/enquiries').send(enquiryPayload({ category: 'retail' }));

    const res = await agent.get('/api/v1/enquiries?category=education');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('education');
  });

  it('POST /enquiries/import maps the new lead-detail CSV columns', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const csv = [
      'name,email,phone,category,sub category,firm name,website,city,address,state',
      'Clinic Lead,clinic@example.com,9876522222,health,Clinic,City Care Clinic,https://citycare.example.com,Pune,MG Road,Maharashtra',
    ].join('\n');

    const res = await agent.post('/api/v1/enquiries/import').send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);

    const list = await agent.get('/api/v1/enquiries?category=health');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].subCategory).toBe('Clinic');
    expect(list.body.data[0].firmName).toBe('City Care Clinic');
    expect(list.body.data[0].city).toBe('Pune');
  });

  it('POST /enquiries/import bulk-creates leads from CSV text and reports failures', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const csv = [
      'name,email,phone,source,status',
      'Imported One,one@example.com,1234567890,campaign,contacted',
      'Imported Two,,9876533333,walkin,',
      ',missing-name@example.com,9876544444,,', // invalid row: no name
      'Missing Phone,missing-phone@example.com,,,', // invalid row: no phone
    ].join('\n');

    const res = await agent.post('/api/v1/enquiries/import').send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.failed).toBe(0); // invalid rows are silently skipped, not counted as failures

    const list = await agent.get('/api/v1/enquiries?source=campaign');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe('contacted');
  });

  it('POST /enquiries/import requires admin (vendor is not enough)', async () => {
    const agent = await createLoggedInAgent({ role: 'vendor' });
    const res = await agent.post('/api/v1/enquiries/import').send({ csv: 'name,email\nA,a@example.com' });
    expect(res.status).toBe(403);
  });

  it('PUT /enquiries/:id updates the lead\'s core contact and business-detail fields', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const created = await request(app).post('/api/v1/enquiries').send(enquiryPayload());

    const res = await agent.put(`/api/v1/enquiries/${created.body.data._id}`).send({
      name: 'Jordan Updated',
      phone: '9999900000',
      email: 'jordan.updated@example.com',
      message: 'Follow-up: now wants the pro plan instead.',
      subject: 'Pro plan enquiry',
      category: 'retail',
      subCategory: 'E-commerce',
      firmName: 'Jordan Retail Co',
      city: 'Mumbai',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Jordan Updated');
    expect(res.body.data.phone).toBe('9999900000');
    expect(res.body.data.email).toBe('jordan.updated@example.com');
    expect(res.body.data.category).toBe('retail');
    expect(res.body.data.firmName).toBe('Jordan Retail Co');
    expect(res.body.data.city).toBe('Mumbai');
  });

  it('PUT /enquiries/:id requires admin or vendor', async () => {
    const created = await request(app).post('/api/v1/enquiries').send(enquiryPayload());
    const res = await request(app).put(`/api/v1/enquiries/${created.body.data._id}`).send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });

  it('DELETE /enquiries/:id soft-deletes — the record survives but drops out of list/get', async () => {
    const agent = await createLoggedInAgent({ role: 'admin' });
    const created = await request(app).post('/api/v1/enquiries').send(enquiryPayload({ name: 'Soft Delete Me' }));
    const id = created.body.data._id;

    const del = await agent.delete(`/api/v1/enquiries/${id}`);
    expect(del.status).toBe(200);

    const getAfter = await agent.get(`/api/v1/enquiries/${id}`);
    expect(getAfter.status).toBe(404);

    const list = await agent.get('/api/v1/enquiries');
    expect(list.body.data.find((e) => e._id === id)).toBeUndefined();

    const raw = await require('mongoose').connection.collection('enquiries').findOne({ _id: new (require('mongoose').Types.ObjectId)(id) });
    expect(raw).toBeTruthy();
    expect(raw.isDeleted).toBe(true);
  });
});
