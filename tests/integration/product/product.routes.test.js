const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');

async function createLoggedInAdmin() {
  const payload = buildUserPayload({ role: 'admin' });
  await request(app).post('/api/v1/users').send(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

describe('Product routes (integration)', () => {
  it('POST /products creates a product with a derived slug', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Website' });

    const res = await agent
      .post('/api/v1/products')
      .send({ name: 'Portfolio Website', category: category.body.data._id });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('portfolio-website');
  });

  it('POST /products auto-generates a unique, category-prefixed code', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Website' });

    const first = await agent.post('/api/v1/products').send({ name: 'Product One', category: category.body.data._id });
    const second = await agent.post('/api/v1/products').send({ name: 'Product Two', category: category.body.data._id });

    expect(first.body.data.code).toBe('WEB-0001');
    expect(second.body.data.code).toBe('WEB-0002');
  });

  it('POST /products derives a multi-word category into an initialism prefix', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Digital Marketing' });

    const res = await agent
      .post('/api/v1/products')
      .send({ name: 'SEO Package', category: category.body.data._id });

    expect(res.body.data.code).toBe('DM-0001');
  });

  it('POST /products respects an explicitly supplied code (uppercased)', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Website' });

    const res = await agent
      .post('/api/v1/products')
      .send({ name: 'Custom Code Product', category: category.body.data._id, code: 'custom-01' });

    expect(res.body.data.code).toBe('CUSTOM-01');
  });

  // Regression test: the subCategory/subSubCategory pre('validate') hook is
  // async and used to call a next() callback Mongoose 9 no longer supplies,
  // throwing "next is not a function" for any product with a subCategory.
  it('POST /products accepts a subCategory that belongs to the given category', async () => {
    const agent = await createLoggedInAdmin();
    const parent = await agent.post('/api/v1/categories').send({ name: 'Website' });
    const child = await agent
      .post('/api/v1/categories')
      .send({ name: 'Portfolio Website', parent: parent.body.data._id });

    const res = await agent.post('/api/v1/products').send({
      name: 'Personal Portfolio',
      category: parent.body.data._id,
      subCategory: child.body.data._id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.subCategory._id).toBe(child.body.data._id);
  });

  it('POST /products rejects a subCategory that is not a child of the given category', async () => {
    const agent = await createLoggedInAdmin();
    const categoryA = await agent.post('/api/v1/categories').send({ name: 'Website' });
    const categoryB = await agent.post('/api/v1/categories').send({ name: 'ERP' });
    const childOfB = await agent
      .post('/api/v1/categories')
      .send({ name: 'HRM', parent: categoryB.body.data._id });

    const res = await agent.post('/api/v1/products').send({
      name: 'Mismatched Product',
      category: categoryA.body.data._id,
      subCategory: childOfB.body.data._id,
    });

    expect(res.status).toBe(500);
  });

  it('POST /products accepts label, addons and notes', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Website' });

    const res = await agent.post('/api/v1/products').send({
      name: 'Premium Portfolio',
      category: category.body.data._id,
      label: 'Bestseller',
      addons: [
        { label: 'Extra revision', value: '1500' },
        { label: 'Priority support', value: '' },
      ],
      notes: ['Client wants dark mode', 'Deliver by Friday'],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.label).toBe('Bestseller');
    expect(res.body.data.addons).toEqual([
      { label: 'Extra revision', value: '1500' },
      { label: 'Priority support', value: '' },
    ]);
    expect(res.body.data.notes).toEqual(['Client wants dark mode', 'Deliver by Friday']);
  });

  it('POST /products rejects an addon without a label', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Website' });

    const res = await agent.post('/api/v1/products').send({
      name: 'Bad Addon Product',
      category: category.body.data._id,
      addons: [{ value: '500' }],
    });

    expect(res.status).toBe(400);
  });

  it('PUT /products/:id updates label, addons and notes', async () => {
    const agent = await createLoggedInAdmin();
    const category = await agent.post('/api/v1/categories').send({ name: 'Website' });
    const created = await agent.post('/api/v1/products').send({ name: 'Editable Product', category: category.body.data._id });

    const res = await agent.put(`/api/v1/products/${created.body.data._id}`).send({
      label: 'New',
      addons: [{ label: 'Rush delivery', value: '2000' }],
      notes: ['Follow up next week'],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe('New');
    expect(res.body.data.addons).toEqual([{ label: 'Rush delivery', value: '2000' }]);
    expect(res.body.data.notes).toEqual(['Follow up next week']);
  });
});
