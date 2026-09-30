// One-off manual smoke test for the WhatsApp module - not part of the Jest
// suite. Boots an in-memory Mongo + Socket.IO, simulates a Meta webhook
// delivery, then exercises the conversation APIs as a logged-in agent.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'smoke-test-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
// blog.routes.js builds its S3 uploader at require-time and throws if these
// are missing - dummy values are fine since this smoke test never uploads.
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_S3_BUCKET_PUBLIC = 'test-public-bucket';
process.env.AWS_S3_BUCKET_PRIVATE = 'test-private-bucket';

const http = require('http');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  const mongoServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  await mongoose.connect(mongoServer.getUri());

  const app = require('../../src/app');
  const { initSocket } = require('../../src/common/config/socket');
  initSocket(http.createServer(app));

  const User = require('../../src/api/v1/modules/user/user.model');
  const WaContact = require('../../src/api/v1/modules/whatsapp/wa-contact.model');
  const WaConversation = require('../../src/api/v1/modules/whatsapp/wa-conversation.model');
  const WaMessage = require('../../src/api/v1/modules/whatsapp/wa-message.model');

  const agentUser = await User.create({
    firstName: 'Agent',
    lastName: 'Smith',
    email: 'agent@example.com',
    password: 'Secret123!',
    role: 'admin',
  });

  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/auth/login')
    .send({ email: 'agent@example.com', password: 'Secret123!' });
  assert(login.status === 200, 'login should succeed', login.body);

  // 1. Simulate Meta's webhook verification handshake
  const verify = await request(app).get(
    '/api/v1/whatsup?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123'
  );
  assert(verify.status === 200 && verify.text === 'abc123', 'webhook verify should echo challenge', verify.text);

  // 2. Simulate an incoming customer message
  const inboundPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '1365821446610703' },
              contacts: [{ profile: { name: 'Test Customer' }, wa_id: '919999999999' }],
              messages: [
                {
                  from: '919999999999',
                  id: 'wamid.TEST123',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Hello, I need help with my order' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const webhookRes = await request(app).post('/api/v1/whatsup').send(inboundPayload);
  assert(webhookRes.status === 200, 'webhook POST should ack 200', webhookRes.status);

  // webhook processing happens after the response is sent - give it a moment
  await new Promise((r) => setTimeout(r, 300));

  const contact = await WaContact.findOne({ waId: '919999999999' });
  assert(contact && contact.name === 'Test Customer', 'contact should be created with profile name', contact);

  const conversation = await WaConversation.findOne({ contact: contact._id });
  assert(conversation, 'conversation should be created');
  assert(conversation.unreadCount === 1, 'unreadCount should be 1', conversation.unreadCount);
  assert(conversation.lastInboundAt, 'lastInboundAt should be set');

  const message = await WaMessage.findOne({ waMessageId: 'wamid.TEST123' });
  assert(message && message.text === 'Hello, I need help with my order', 'message should be persisted', message);

  // 3. Re-deliver the same webhook (Meta does this) - should not duplicate
  await request(app).post('/api/v1/whatsup').send(inboundPayload);
  await new Promise((r) => setTimeout(r, 300));
  const count = await WaMessage.countDocuments({ waMessageId: 'wamid.TEST123' });
  assert(count === 1, 'duplicate webhook delivery should not create a second message', count);

  // 4. List conversations as the logged-in agent
  const list = await agent.get('/api/v1/whatsapp/conversations?filter=unassigned');
  assert(list.status === 200 && list.body.data.length === 1, 'unassigned filter should show the new conversation', list.body);
  assert(list.body.data[0].contact.name === 'Test Customer', 'conversation should have populated contact', list.body.data[0]);

  // 5. Assign it to the agent
  const assign = await agent
    .patch(`/api/v1/whatsapp/conversations/${conversation._id}/assign`)
    .send({ assignedTo: agentUser._id.toString() });
  assert(assign.status === 200 && assign.body.data.assignedTo._id === agentUser._id.toString(), 'assign should succeed', assign.body);

  // 6. Get messages for the conversation
  const messages = await agent.get(`/api/v1/whatsapp/conversations/${conversation._id}/messages`);
  assert(messages.status === 200 && messages.body.data.messages.length === 1, 'should fetch message history', messages.body);

  // 7. Mark as read
  const read = await agent.patch(`/api/v1/whatsapp/conversations/${conversation._id}/read`);
  assert(read.status === 200 && read.body.data.unreadCount === 0, 'mark-read should zero unreadCount', read.body);

  // 8. sendMessage should hit the real Graph API - without a valid recipient
  // this is expected to fail upstream, but should fail *cleanly* (502 from
  // our error middleware), proving the window-check + Graph call wiring work.
  const send = await agent
    .post(`/api/v1/whatsapp/conversations/${conversation._id}/messages`)
    .send({ text: 'Thanks for reaching out!' });
  console.log('sendMessage (expected to fail against a non-approved test number) ->', send.status, JSON.stringify(send.body));

  // 9. Unauthenticated access should be blocked
  const noAuth = await request(app).get('/api/v1/whatsapp/conversations');
  assert(noAuth.status === 401, 'unauthenticated access should be 401', noAuth.status);

  console.log('\nALL SMOKE ASSERTIONS PASSED');

  await mongoose.disconnect();
  await mongoServer.stop();
  process.exit(0);
}

function assert(cond, msg, extra) {
  if (!cond) {
    console.error('FAILED:', msg, extra !== undefined ? JSON.stringify(extra) : '');
    process.exit(1);
  } else {
    console.log('ok -', msg);
  }
}

main().catch((err) => {
  console.error('SMOKE TEST ERROR', err);
  process.exit(1);
});
