const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');

async function registerUser(overrides = {}) {
  const payload = buildUserPayload(overrides);
  const res = await request(app).post('/api/v1/users').send(payload);
  return { user: res.body.data, payload };
}

describe('Auth routes (integration)', () => {
  it('POST /login rejects an unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
  });

  it('POST /login rejects a wrong password with 401', async () => {
    const { payload } = await registerUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('POST /login succeeds and establishes a session cookie, without leaking the password', async () => {
    const { payload } = await registerUser();
    const agent = request.agent(app);
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(payload.email.toLowerCase());
    expect(res.body.data.password).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('PATCH /change-password requires an active session (401 without one)', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'newpass1' });
    expect(res.status).toBe(401);
  });

  it('PATCH /change-password rejects a wrong currentPassword with 401', async () => {
    const { payload } = await registerUser();
    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });

    const res = await agent
      .patch('/api/v1/auth/change-password')
      .send({ currentPassword: 'totally-wrong', newPassword: 'NewSecret123!' });
    expect(res.status).toBe(401);
  });

  it('PATCH /change-password changes the password; old one stops working, new one works', async () => {
    const { payload } = await registerUser();
    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });

    const change = await agent
      .patch('/api/v1/auth/change-password')
      .send({ currentPassword: payload.password, newPassword: 'NewSecret123!' });
    expect(change.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'NewSecret123!' });
    expect(newLogin.status).toBe(200);
  });

  it('POST /logout ends the session so a second logout is unauthenticated', async () => {
    const { payload } = await registerUser();
    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });

    const logout = await agent.post('/api/v1/auth/logout');
    expect(logout.status).toBe(200);

    const secondLogout = await agent.post('/api/v1/auth/logout');
    expect(secondLogout.status).toBe(401);
  });

  it('POST /forgot-password returns the same generic message for known and unknown emails', async () => {
    const { payload } = await registerUser();

    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: payload.email });
    expect(known.status).toBe(200);
    expect(known.body.data.resetToken).toBeDefined();

    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(unknown.body.data).toBeNull();
  });

  it('PATCH /reset-password/:token sets a new password that can log in', async () => {
    const { payload } = await registerUser();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: payload.email });
    const { resetToken } = forgot.body.data;

    const reset = await request(app)
      .patch(`/api/v1/auth/reset-password/${resetToken}`)
      .send({ password: 'ResetSecret123!' });
    expect(reset.status).toBe(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'ResetSecret123!' });
    expect(login.status).toBe(200);
  });

  it('PATCH /reset-password/:token rejects an invalid token with 400', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/reset-password/not-a-real-token')
      .send({ password: 'whatever123' });
    expect(res.status).toBe(400);
  });

  it('PATCH /reset-password/:token cannot be replayed once used', async () => {
    const { payload } = await registerUser();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: payload.email });
    const { resetToken } = forgot.body.data;

    await request(app)
      .patch(`/api/v1/auth/reset-password/${resetToken}`)
      .send({ password: 'FirstReset123!' });

    const replay = await request(app)
      .patch(`/api/v1/auth/reset-password/${resetToken}`)
      .send({ password: 'SecondReset123!' });
    expect(replay.status).toBe(400);
  });
});
