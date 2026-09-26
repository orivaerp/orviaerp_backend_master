const request = require('supertest');
const app = require('../helpers/app');
const { buildUserPayload } = require('../helpers/factories');

// Cross-module e2e: two regular users and one admin interacting over a single
// blog post, exercising registration + auth + ownership/role enforcement
// together rather than any one module in isolation.
describe('Multi-user permissions journey (e2e)', () => {
  const ownerAgent = request.agent(app);
  const otherAgent = request.agent(app);
  const adminAgent = request.agent(app);

  const owner = buildUserPayload();
  const other = buildUserPayload();
  const admin = buildUserPayload({ role: 'admin' });

  let blogId;

  it('registers the owner, another user, and an admin', async () => {
    const [ownerRes, otherRes, adminRes] = await Promise.all([
      request(app).post('/api/v1/users').send(owner),
      request(app).post('/api/v1/users').send(other),
      request(app).post('/api/v1/users').send(admin),
    ]);
    expect(ownerRes.status).toBe(201);
    expect(otherRes.status).toBe(201);
    expect(adminRes.status).toBe(201);
    expect(adminRes.body.data.role).toBe('admin');
  });

  it('logs in all three', async () => {
    const [ownerLogin, otherLogin, adminLogin] = await Promise.all([
      ownerAgent.post('/api/v1/auth/login').send({ email: owner.email, password: owner.password }),
      otherAgent.post('/api/v1/auth/login').send({ email: other.email, password: other.password }),
      adminAgent.post('/api/v1/auth/login').send({ email: admin.email, password: admin.password }),
    ]);
    expect(ownerLogin.status).toBe(200);
    expect(otherLogin.status).toBe(200);
    expect(adminLogin.status).toBe(200);
  });

  it('the owner creates a blog post', async () => {
    const res = await ownerAgent.post('/api/v1/blogs').send({
      title: 'Owner Only Post',
      content: 'Only the owner or an admin should be able to change this post. Twenty+ chars.',
      status: 'published',
    });
    expect(res.status).toBe(201);
    blogId = res.body.data._id;
  });

  it('a different regular user cannot update or delete it', async () => {
    const update = await otherAgent.put(`/api/v1/blogs/${blogId}`).send({ status: 'archived' });
    expect(update.status).toBe(403);

    const del = await otherAgent.delete(`/api/v1/blogs/${blogId}`);
    expect(del.status).toBe(403);
  });

  it('the post is unchanged after the blocked attempts', async () => {
    const res = await request(app).get(`/api/v1/blogs/${blogId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('published');
  });

  it('an admin can update the post despite not being the author', async () => {
    const res = await adminAgent.put(`/api/v1/blogs/${blogId}`).send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
  });

  it('the owner can still delete their own post', async () => {
    const res = await ownerAgent.delete(`/api/v1/blogs/${blogId}`);
    expect(res.status).toBe(200);

    const after = await request(app).get(`/api/v1/blogs/${blogId}`);
    expect(after.status).toBe(404);
  });

  it('logging out one user does not affect the others\' sessions', async () => {
    await ownerAgent.post('/api/v1/auth/logout');

    const ownerBlocked = await ownerAgent.post('/api/v1/blogs').send({
      title: 'Should fail, owner is logged out',
      content: 'This should fail because the owner session was just ended. Twenty+ chars.',
    });
    expect(ownerBlocked.status).toBe(401);

    const otherStillIn = await otherAgent.post('/api/v1/blogs').send({
      title: 'Still Logged In Post',
      content: 'The other user is unaffected by the owner logging out. Twenty+ characters.',
    });
    expect(otherStillIn.status).toBe(201);
  });
});
