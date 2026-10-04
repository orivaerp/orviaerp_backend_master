const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');
const Enquiry = require('../../../src/api/v1/modules/enquiry/enquiry.model');

async function adminAgent() {
  const payload = buildUserPayload({ role: 'admin' });
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

// Inserts N leads with strictly increasing createdAt so ordering is deterministic.
async function seedEnquiries(count, overrides = () => ({})) {
  const base = Date.now() - count * 1000;
  await Enquiry.insertMany(
    Array.from({ length: count }, (_, i) => ({
      name: `Lead ${String(i + 1).padStart(2, '0')}`,
      phone: `98765000${String(i).padStart(2, '0')}`,
      createdAt: new Date(base + i * 1000),
      ...overrides(i),
    }))
  );
}

describe('Server-side pagination (integration)', () => {
  it('returns the full list with no meta when `page` is not sent (existing callers unaffected)', async () => {
    const agent = await adminAgent();
    await seedEnquiries(12);

    const res = await agent.get('/api/v1/enquiries');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body.meta).toBeUndefined();
  });

  it('returns one page, newest first, with accurate meta', async () => {
    const agent = await adminAgent();
    await seedEnquiries(25);

    const first = await agent.get('/api/v1/enquiries?page=1&limit=10');
    expect(first.body.data).toHaveLength(10);
    expect(first.body.data[0].name).toBe('Lead 25');
    expect(first.body.data[9].name).toBe('Lead 16');
    expect(first.body.meta).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });

    const last = await agent.get('/api/v1/enquiries?page=3&limit=10');
    expect(last.body.data).toHaveLength(5);
    expect(last.body.data[4].name).toBe('Lead 01');
  });

  it('pages never overlap and together cover every record', async () => {
    const agent = await adminAgent();
    await seedEnquiries(23);

    const names = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await agent.get(`/api/v1/enquiries?page=${page}&limit=10`);
      names.push(...res.body.data.map((e) => e.name));
    }
    expect(names).toHaveLength(23);
    expect(new Set(names).size).toBe(23);
  });

  it('applies filters before paginating, so total reflects the filtered set', async () => {
    const agent = await adminAgent();
    await seedEnquiries(15, (i) => ({ status: i % 3 === 0 ? 'converted' : 'new' }));

    const res = await agent.get('/api/v1/enquiries?status=converted&page=1&limit=3');
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((e) => e.status === 'converted')).toBe(true);
    expect(res.body.meta).toEqual({ page: 1, limit: 3, total: 5, totalPages: 2 });
  });

  it('does not count soft-deleted records', async () => {
    const agent = await adminAgent();
    await seedEnquiries(6, (i) => ({ isDeleted: i < 2 }));

    const res = await agent.get('/api/v1/enquiries?page=1&limit=10');
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data).toHaveLength(4);
  });

  it('returns an empty page (not an error) beyond the last page', async () => {
    const agent = await adminAgent();
    await seedEnquiries(5);

    const res = await agent.get('/api/v1/enquiries?page=9&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(5);
  });

  it('clamps nonsense page/limit values and caps limit at 100', async () => {
    const agent = await adminAgent();
    await seedEnquiries(3);

    const bad = await agent.get('/api/v1/enquiries?page=-4&limit=abc');
    expect(bad.status).toBe(200);
    expect(bad.body.meta).toMatchObject({ page: 1, limit: 10 });

    const huge = await agent.get('/api/v1/enquiries?page=1&limit=100000');
    expect(huge.body.meta.limit).toBe(100);
  });

  it('reports totalPages 1 for an empty result', async () => {
    const agent = await adminAgent();
    const res = await agent.get('/api/v1/enquiries?page=1&limit=10');
    expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 1 });
  });

  it('paginates users, blogs, products and contacts the same way', async () => {
    const agent = await adminAgent();

    const users = await agent.get('/api/v1/users?page=1&limit=1');
    expect(users.status).toBe(200);
    expect(users.body.data).toHaveLength(1);
    expect(users.body.meta).toMatchObject({ page: 1, limit: 1, total: 1 });

    for (const path of ['blogs', 'products', 'contacts']) {
      const res = await agent.get(`/api/v1/${path}?page=1&limit=5`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 1, limit: 5, total: 0, totalPages: 1 });
      expect(res.body.data).toEqual([]);
    }
  });

  it('keeps role protection: paginating does not bypass admin-only lists', async () => {
    const sales = buildUserPayload({ role: 'sales' });
    await registerUser(sales);
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: sales.email, password: sales.password });

    expect((await agent.get('/api/v1/users?page=1&limit=5')).status).toBe(403);
    expect((await agent.get('/api/v1/contacts?page=1&limit=5')).status).toBe(403);
    expect((await agent.get('/api/v1/enquiries?page=1&limit=5')).status).toBe(200);
  });
});
