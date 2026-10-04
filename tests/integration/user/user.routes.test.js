const request = require('supertest');
const app = require('../../helpers/app');
const User = require('../../../src/api/v1/modules/user/user.model');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function loginAs(role) {
  const payload = buildUserPayload({ role });
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

describe('User routes (integration)', () => {
  it('POST /api/v1/users creates a user, hashes the password, and never returns it', async () => {
    const payload = buildUserPayload();
    const res = await request(app).post('/api/v1/users').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(payload.email.toLowerCase());
    expect(res.body.data.password).toBeUndefined();

    const stored = await User.findOne({ email: payload.email }).select('+password');
    expect(stored.password).not.toBe(payload.password);
    await expect(stored.comparePassword(payload.password)).resolves.toBe(true);
  });

  it('POST /api/v1/users rejects a duplicate email with 409', async () => {
    const payload = buildUserPayload();
    await request(app).post('/api/v1/users').send(payload);

    const res = await request(app).post('/api/v1/users').send(payload);
    expect(res.status).toBe(409);
  });

  it('POST /api/v1/users rejects an invalid payload with 400', async () => {
    const res = await request(app).post('/api/v1/users').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  describe('roles', () => {
    it('public sign-up cannot self-assign a privileged role', async () => {
      for (const role of ['admin', 'vendor', 'sales']) {
        const res = await request(app).post('/api/v1/users').send(buildUserPayload({ role }));
        expect(res.status).toBe(201);
        expect(res.body.data.role).toBe('user');
      }
    });

    it('a non-admin staff account cannot assign roles either', async () => {
      const sales = await loginAs('sales');
      const res = await sales.post('/api/v1/users').send(buildUserPayload({ role: 'admin' }));
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('user');
    });

    it('an admin can create users with any role, including sales', async () => {
      const admin = await loginAs('admin');
      for (const role of ['admin', 'vendor', 'sales', 'user']) {
        const res = await admin.post('/api/v1/users').send(buildUserPayload({ role }));
        expect(res.status).toBe(201);
        expect(res.body.data.role).toBe(role);
      }
    });

    it('rejects an unknown role with 400', async () => {
      const admin = await loginAs('admin');
      const res = await admin.post('/api/v1/users').send(buildUserPayload({ role: 'superadmin' }));
      expect(res.status).toBe(400);
    });

    it.each(['user', 'vendor', 'sales'])('%s cannot list, read, update or delete users', async (role) => {
      const agent = await loginAs(role);
      const target = await request(app).post('/api/v1/users').send(buildUserPayload());
      const id = target.body.data._id;

      expect((await agent.get('/api/v1/users')).status).toBe(403);
      expect((await agent.get(`/api/v1/users/${id}`)).status).toBe(403);
      expect((await agent.put(`/api/v1/users/${id}`).send({ firstName: 'X' })).status).toBe(403);
      expect((await agent.delete(`/api/v1/users/${id}`)).status).toBe(403);
    });

    it('anonymous callers get 401 on the admin-only user routes', async () => {
      expect((await request(app).get('/api/v1/users')).status).toBe(401);
      expect((await request(app).delete('/api/v1/users/000000000000000000000000')).status).toBe(401);
    });
  });

  describe('admin management', () => {
    it('GET /api/v1/users lists users', async () => {
      const admin = await loginAs('admin');
      const res = await admin.get('/api/v1/users');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/users/:id fetches a single user', async () => {
      const admin = await loginAs('admin');
      const created = await request(app).post('/api/v1/users').send(buildUserPayload());
      const res = await admin.get(`/api/v1/users/${created.body.data._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(created.body.data._id);
    });

    it('GET /api/v1/users/:id returns 404 for a missing user', async () => {
      const admin = await loginAs('admin');
      const res = await admin.get('/api/v1/users/000000000000000000000000');
      expect(res.status).toBe(404);
    });

    it('PUT /api/v1/users/:id updates a user, including switching them to sales', async () => {
      const admin = await loginAs('admin');
      const created = await request(app).post('/api/v1/users').send(buildUserPayload());
      const res = await admin
        .put(`/api/v1/users/${created.body.data._id}`)
        .send({ firstName: 'Updated', role: 'sales' });
      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe('Updated');
      expect(res.body.data.role).toBe('sales');
    });

    it('DELETE /api/v1/users/:id deletes a user', async () => {
      const admin = await loginAs('admin');
      const created = await request(app).post('/api/v1/users').send(buildUserPayload());
      const del = await admin.delete(`/api/v1/users/${created.body.data._id}`);
      expect(del.status).toBe(200);

      const after = await admin.get(`/api/v1/users/${created.body.data._id}`);
      expect(after.status).toBe(404);
    });
  });
});
