const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function createLoggedInAdmin() {
  const payload = buildUserPayload({ role: 'admin' });
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

describe('Category routes (integration)', () => {
  it('POST /categories creates a top-level category', async () => {
    const agent = await createLoggedInAdmin();

    const res = await agent.post('/api/v1/categories').send({ name: 'Website' });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('website');
    expect(res.body.data.level).toBe(0);
  });

  // Regression test: the schema's pre('save') hook is `async function () {...}`.
  // Mongoose only supplies a real `next` callback to non-async middleware —
  // calling next() from an async hook used to throw "next is not a function"
  // as soon as a category with a parent was saved (i.e. any subcategory).
  it('POST /categories creates a subcategory and derives ancestors/level/path', async () => {
    const agent = await createLoggedInAdmin();

    const parent = await agent.post('/api/v1/categories').send({ name: 'Website' });
    const child = await agent
      .post('/api/v1/categories')
      .send({ name: 'Portfolio Website', parent: parent.body.data._id });

    expect(child.status).toBe(201);
    expect(child.body.data.level).toBe(1);
    expect(child.body.data.path).toBe('website/portfolio-website');
    expect(child.body.data.ancestors).toHaveLength(1);
    expect(child.body.data.ancestors[0].slug).toBe('website');
  });

  it('POST /categories requires admin', async () => {
    const res = await request(app).post('/api/v1/categories').send({ name: 'Website' });
    expect(res.status).toBe(401);
  });
});
