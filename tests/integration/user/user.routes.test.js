const request = require('supertest');
const app = require('../../helpers/app');
const User = require('../../../src/api/v1/modules/user/user.model');
const { buildUserPayload } = require('../../helpers/factories');

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

  it('GET /api/v1/users lists users', async () => {
    await request(app).post('/api/v1/users').send(buildUserPayload());
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/users/:id fetches a single user', async () => {
    const created = await request(app).post('/api/v1/users').send(buildUserPayload());
    const res = await request(app).get(`/api/v1/users/${created.body.data._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(created.body.data._id);
  });

  it('GET /api/v1/users/:id returns 404 for a missing user', async () => {
    const res = await request(app).get('/api/v1/users/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('PUT /api/v1/users/:id updates a user', async () => {
    const created = await request(app).post('/api/v1/users').send(buildUserPayload());
    const res = await request(app)
      .put(`/api/v1/users/${created.body.data._id}`)
      .send({ firstName: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Updated');
  });

  it('DELETE /api/v1/users/:id deletes a user', async () => {
    const created = await request(app).post('/api/v1/users').send(buildUserPayload());
    const del = await request(app).delete(`/api/v1/users/${created.body.data._id}`);
    expect(del.status).toBe(200);

    const after = await request(app).get(`/api/v1/users/${created.body.data._id}`);
    expect(after.status).toBe(404);
  });
});
