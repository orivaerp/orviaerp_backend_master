const request = require('supertest');
const app = require('../helpers/app');
const { buildUserPayload } = require('../helpers/factories');

// A single realistic client journey across all three modules (user, auth, blog),
// run as ordered steps sharing state - unlike the integration suite, which
// exercises each module's routes in isolation. Jest runs `it` blocks within a
// describe in declaration order, so state built up in one step is available to
// the next.
describe('Full user journey (e2e)', () => {
  const agent = request.agent(app);
  const registration = buildUserPayload();
  let userId;
  let blogId;
  let currentPassword = registration.password;

  it('registers a new user', async () => {
    const res = await request(app).post('/api/v1/users').send(registration);
    expect(res.status).toBe(201);
    expect(res.body.data.password).toBeUndefined();
    userId = res.body.data._id;
  });

  it('blocks blog creation before logging in', async () => {
    const res = await agent.post('/api/v1/blogs').send({
      title: 'Should Not Be Created',
      content: 'This should be rejected because there is no session yet, twenty+ chars.',
    });
    expect(res.status).toBe(401);
  });

  it('logs in with the registered credentials', async () => {
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: currentPassword });
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(userId);
  });

  it('creates a blog post as the logged-in user', async () => {
    const res = await agent.post('/api/v1/blogs').send({
      title: 'My E2E Journey Post',
      content: 'This is the full body of the e2e test blog post, well over twenty characters.',
      status: 'published',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.author).toBe(userId);
    expect(res.body.data.slug).toBe('my-e2e-journey-post');
    blogId = res.body.data._id;
  });

  it('sees the new post in the public listing and by slug', async () => {
    const list = await request(app).get('/api/v1/blogs');
    expect(list.body.data.some((b) => b._id === blogId)).toBe(true);

    const bySlug = await request(app).get('/api/v1/blogs/slug/my-e2e-journey-post');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data._id).toBe(blogId);
  });

  it('updates its own post', async () => {
    const res = await agent.put(`/api/v1/blogs/${blogId}`).send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
  });

  it('changes password while logged in', async () => {
    const newPassword = 'ChangedSecret123!';
    const res = await agent
      .patch('/api/v1/auth/change-password')
      .send({ currentPassword, newPassword });
    expect(res.status).toBe(200);
    currentPassword = newPassword;
  });

  it('logs out, ending the session', async () => {
    const res = await agent.post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
  });

  it('rejects login with the old (pre-change) password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password });
    expect(res.status).toBe(401);
  });

  it('logs back in with the changed password', async () => {
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: currentPassword });
    expect(res.status).toBe(200);
  });

  it('runs the forgot/reset password flow end to end', async () => {
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: registration.email });
    expect(forgot.status).toBe(200);
    const { resetToken } = forgot.body.data;

    const newPassword = 'ResetViaEmailFlow123!';
    const reset = await request(app)
      .patch(`/api/v1/auth/reset-password/${resetToken}`)
      .send({ password: newPassword });
    expect(reset.status).toBe(200);
    currentPassword = newPassword;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: currentPassword });
    expect(login.status).toBe(200);
  });

  it('cleans up: deletes the blog, then the user', async () => {
    const deleteBlog = await agent.delete(`/api/v1/blogs/${blogId}`);
    expect(deleteBlog.status).toBe(200);

    const blogAfter = await request(app).get(`/api/v1/blogs/${blogId}`);
    expect(blogAfter.status).toBe(404);

    const deleteUser = await request(app).delete(`/api/v1/users/${userId}`);
    expect(deleteUser.status).toBe(200);

    const userAfter = await request(app).get(`/api/v1/users/${userId}`);
    expect(userAfter.status).toBe(404);
  });
});
