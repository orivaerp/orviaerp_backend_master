const request = require('supertest');

jest.mock('../../../src/api/v1/modules/whatsapp/cloud-api.service', () => ({
  uploadMedia: jest.fn(async () => '1581940549868425'),
  downloadMedia: jest.fn(async () => ({ buffer: Buffer.from('png-bytes'), mimeType: 'image/png' })),
}));

const app = require('../../helpers/app');
const cloudApi = require('../../../src/api/v1/modules/whatsapp/cloud-api.service');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function loginAs(role) {
  const payload = buildUserPayload({ role });
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

const png = Buffer.from('fake-png');

describe('WhatsApp media library (integration)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploads a file to Meta and lists it with its media ID', async () => {
    const admin = await loginAs('admin');
    const res = await admin
      .post('/api/v1/whatsapp/media')
      .attach('file', png, { filename: 'offer.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      mediaId: '1581940549868425',
      type: 'image',
      filename: 'offer.png',
      mimeType: 'image/png',
    });
    expect(cloudApi.uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png', filename: 'offer.png' })
    );

    const list = await admin.get('/api/v1/whatsapp/media');
    expect(list.body.data).toHaveLength(1);
    expect((await admin.get('/api/v1/whatsapp/media?type=video')).body.data).toHaveLength(0);
  });

  it('rejects a missing file and unsupported types without calling Meta', async () => {
    const admin = await loginAs('admin');
    expect((await admin.post('/api/v1/whatsapp/media')).status).toBe(400);
    const bad = await admin
      .post('/api/v1/whatsapp/media')
      .attach('file', Buffer.from('x'), { filename: 'a.gif', contentType: 'image/gif' });
    expect(bad.status).toBe(400);
    expect(cloudApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('rejects an image over 5 MB', async () => {
    const admin = await loginAs('admin');
    const res = await admin
      .post('/api/v1/whatsapp/media')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/5 MB/);
    expect(cloudApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('streams the file back for previews and can remove it', async () => {
    const admin = await loginAs('admin');
    const created = await admin
      .post('/api/v1/whatsapp/media')
      .attach('file', png, { filename: 'offer.png', contentType: 'image/png' });
    const id = created.body.data._id;

    const file = await admin.get(`/api/v1/whatsapp/media/${id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');

    expect((await admin.delete(`/api/v1/whatsapp/media/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/v1/whatsapp/media/${id}/file`)).status).toBe(404);
    expect((await admin.delete('/api/v1/whatsapp/media/not-an-id')).status).toBe(404);
  });

  it('is admin-only', async () => {
    const vendor = await loginAs('vendor');
    expect((await vendor.get('/api/v1/whatsapp/media')).status).toBe(403);
    expect((await request(app).get('/api/v1/whatsapp/media')).status).toBe(401);
  });
});
