const request = require('supertest');

jest.mock('../../../src/api/v1/modules/whatsapp/cloud-api.service', () => ({
  sendTemplateMessage: jest.fn(async () => 'wamid.TEMPLATE1'),
}));
jest.mock('../../../src/common/config/socket', () => ({
  getIO: () => ({ to: () => ({ emit: () => {} }) }),
}));

const app = require('../../helpers/app');
const cloudApi = require('../../../src/api/v1/modules/whatsapp/cloud-api.service');
const WaContact = require('../../../src/api/v1/modules/whatsapp/wa-contact.model');
const WaConversation = require('../../../src/api/v1/modules/whatsapp/wa-conversation.model');
const { buildUserPayload } = require('../../helpers/factories');
const { registerUser } = require('../../helpers/seed');

async function loginAsAdmin() {
  const payload = buildUserPayload({ role: 'admin' });
  await registerUser(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return agent;
}

describe('Template messages from the inbox (integration)', () => {
  it('stores which template and values were sent, so the inbox can render it', async () => {
    const admin = await loginAsAdmin();
    const contact = await WaContact.create({ waId: '919876543210', name: 'Raj' });
    const conversation = await WaConversation.create({ contact: contact._id });

    const res = await admin
      .post(`/api/v1/whatsapp/conversations/${conversation._id}/template-messages`)
      .send({ name: 'orvia_pharmacy_free_trial', language: 'en', bodyParams: ['Akhil'] });

    expect(res.status).toBe(201);
    expect(cloudApi.sendTemplateMessage).toHaveBeenCalled();
    expect(res.body.data.type).toBe('template');
    expect(res.body.data.text).toBe('[template: orvia_pharmacy_free_trial] Akhil');
    expect(res.body.data.template).toMatchObject({
      name: 'orvia_pharmacy_free_trial',
      language: 'en',
      bodyParams: ['Akhil'],
    });

    const thread = await admin.get(`/api/v1/whatsapp/conversations/${conversation._id}/messages`);
    expect(thread.body.data.messages[0].template.name).toBe('orvia_pharmacy_free_trial');
  });

  it('passes the header image/video/document on to WhatsApp, and rejects a malformed one', async () => {
    const admin = await loginAsAdmin();
    const contact = await WaContact.create({ waId: '919876543211', name: 'Sita' });
    const conversation = await WaConversation.create({ contact: contact._id });
    const url = `/api/v1/whatsapp/conversations/${conversation._id}/template-messages`;

    const ok = await admin.post(url).send({
      name: 'orvia_pharmacy_free_trial',
      language: 'en',
      bodyParams: ['Sita'],
      headerMedia: { type: 'image', id: '1581940549868425' },
    });
    expect(ok.status).toBe(201);
    expect(cloudApi.sendTemplateMessage).toHaveBeenLastCalledWith(
      '919876543211',
      expect.objectContaining({ headerMedia: { type: 'image', id: '1581940549868425' } })
    );

    const bad = await admin
      .post(url)
      .send({ name: 'x', language: 'en', headerMedia: { type: 'image' } });
    expect(bad.status).toBe(400);
  });
});
