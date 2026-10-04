const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function createLoggedInAgent(overrides = {}) {
  const payload = buildUserPayload(overrides);
  const created = await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return { agent, user: created.body.data, payload };
}

function blogPayload(overrides = {}) {
  return {
    title: 'My Integration Test Post',
    content: 'This is the full body of the blog post, comfortably over twenty characters.',
    status: 'published',
    ...overrides,
  };
}

describe('Blog routes (integration)', () => {
  it('POST /blogs requires an authenticated session (401 without one)', async () => {
    const res = await request(app).post('/api/v1/blogs').send(blogPayload());
    expect(res.status).toBe(401);
  });

  it('POST /blogs creates a blog with a derived slug, the session user as author, and publishedAt set', async () => {
    const { agent, user } = await createLoggedInAgent();
    const res = await agent.post('/api/v1/blogs').send(blogPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('my-integration-test-post');
    expect(res.body.data.author).toBe(user._id);
    expect(res.body.data.publishedAt).toBeTruthy();
  });

  it('POST /blogs rejects an invalid payload with 400', async () => {
    const { agent } = await createLoggedInAgent();
    const res = await agent.post('/api/v1/blogs').send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('GET /blogs and GET /blogs/:id are public and populate the author', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());

    const list = await request(app).get('/api/v1/blogs');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].author.email).toBeDefined();

    const byId = await request(app).get(`/api/v1/blogs/${created.body.data._id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.author.email).toBeDefined();
  });

  it('GET /blogs/slug/:slug fetches a blog by slug', async () => {
    const { agent } = await createLoggedInAgent();
    await agent.post('/api/v1/blogs').send(blogPayload({ title: 'Unique Slug Post' }));

    const res = await request(app).get('/api/v1/blogs/slug/unique-slug-post');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Unique Slug Post');
  });

  it('GET /blogs/:id returns 404 for a missing blog', async () => {
    const res = await request(app).get('/api/v1/blogs/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('PUT /blogs/:id lets the author update their own blog', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());

    const res = await agent
      .put(`/api/v1/blogs/${created.body.data._id}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
  });

  it('PUT /blogs/:id blocks a non-owner, non-admin user with 403', async () => {
    const { agent: ownerAgent } = await createLoggedInAgent();
    const created = await ownerAgent.post('/api/v1/blogs').send(blogPayload());

    const { agent: otherAgent } = await createLoggedInAgent();
    const res = await otherAgent
      .put(`/api/v1/blogs/${created.body.data._id}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(403);
  });

  it('PUT /blogs/:id allows an admin to update someone else\'s blog', async () => {
    const { agent: ownerAgent } = await createLoggedInAgent();
    const created = await ownerAgent.post('/api/v1/blogs').send(blogPayload());

    const { agent: adminAgent } = await createLoggedInAgent({ role: 'admin' });
    const res = await adminAgent
      .put(`/api/v1/blogs/${created.body.data._id}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(200);
  });

  it('DELETE /blogs/:id blocks a non-owner with 403, and the owner can delete', async () => {
    const { agent: ownerAgent } = await createLoggedInAgent();
    const created = await ownerAgent.post('/api/v1/blogs').send(blogPayload());

    const { agent: otherAgent } = await createLoggedInAgent();
    const blocked = await otherAgent.delete(`/api/v1/blogs/${created.body.data._id}`);
    expect(blocked.status).toBe(403);

    const deleted = await ownerAgent.delete(`/api/v1/blogs/${created.body.data._id}`);
    expect(deleted.status).toBe(200);

    const after = await request(app).get(`/api/v1/blogs/${created.body.data._id}`);
    expect(after.status).toBe(404);
  });
});
