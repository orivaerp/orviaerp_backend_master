// One-off manual smoke test for the bulk broadcast feature - mocks the Graph
// API send call so it doesn't actually hit Meta or need a valid token.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'smoke-test-secret';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_S3_BUCKET_PUBLIC = 'test-public-bucket';
process.env.AWS_S3_BUCKET_PRIVATE = 'test-private-bucket';

const http = require('http');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock the Graph API send before anything requires cloud-api.service, so
// broadcast.service.js picks up the mock.
const cloudApi = require('../../src/api/v1/modules/whatsapp/cloud-api.service');
let callCount = 0;
cloudApi.sendTemplateMessage = async (to) => {
  callCount += 1;
  if (to === '910000000666') throw new Error('simulated failure for this number');
  return `wamid.MOCK_${to}_${callCount}`;
};

async function main() {
  const mongoServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  await mongoose.connect(mongoServer.getUri());

  const app = require('../../src/app');
  const { initSocket } = require('../../src/common/config/socket');
  initSocket(http.createServer(app));

  const User = require('../../src/api/v1/modules/user/user.model');
  const WaBroadcast = require('../../src/api/v1/modules/whatsapp/wa-broadcast.model');
  const WaMessage = require('../../src/api/v1/modules/whatsapp/wa-message.model');
  const WaConversation = require('../../src/api/v1/modules/whatsapp/wa-conversation.model');

  await User.create({
    firstName: 'Agent',
    lastName: 'Smith',
    email: 'agent@example.com',
    password: 'Secret123!',
    role: 'admin',
  });

  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: 'agent@example.com', password: 'Secret123!' });

  // 1. Reject invalid payloads
  const badRes = await agent.post('/api/v1/whatsapp/broadcasts').send({
    templateName: 'hello_world',
    templateLanguage: 'en_US',
    recipients: [],
  });
  assert(badRes.status === 400, 'empty recipients should be rejected', badRes.body);

  const tooMany = Array.from({ length: 1001 }, (_, i) => `91900000${String(i).padStart(4, '0')}`);
  const tooManyRes = await agent.post('/api/v1/whatsapp/broadcasts').send({
    templateName: 'hello_world',
    templateLanguage: 'en_US',
    recipients: tooMany,
  });
  assert(tooManyRes.status === 400, '1001 recipients should be rejected (max 1000)', tooManyRes.body);

  // 2. Start a real (mocked) broadcast: 4 good numbers + 1 that fails
  const recipients = ['910000000111', '910000000222', '910000000333', '910000000666'];
  const startRes = await agent.post('/api/v1/whatsapp/broadcasts').send({
    templateName: 'hello_world',
    templateLanguage: 'en_US',
    bodyParams: [],
    recipients,
  });
  assert(startRes.status === 202, 'broadcast should start with 202', startRes.body);
  const broadcastId = startRes.body.data._id;
  assert(startRes.body.data.totalCount === 4, 'totalCount should match recipients length', startRes.body.data);

  // 3. Unauthenticated access should be blocked
  const noAuth = await request(app).get('/api/v1/whatsapp/broadcasts');
  assert(noAuth.status === 401, 'unauthenticated list access should be 401', noAuth.status);

  // processing runs in the background with a 150ms delay per recipient -
  // wait generously for all 4 to finish.
  await new Promise((r) => setTimeout(r, 2000));

  const finalRes = await agent.get(`/api/v1/whatsapp/broadcasts/${broadcastId}`);
  assert(finalRes.status === 200, 'should fetch broadcast by id', finalRes.body);
  const broadcast = finalRes.body.data;
  assert(broadcast.status === 'completed', 'broadcast should be completed', broadcast.status);
  assert(broadcast.sentCount === 3, 'sentCount should be 3', broadcast.sentCount);
  assert(broadcast.failedCount === 1, 'failedCount should be 1', broadcast.failedCount);

  const failedRecipient = broadcast.recipients.find((r) => r.waId === '910000000666');
  assert(failedRecipient.status === 'failed', 'the bad number should be marked failed', failedRecipient);
  assert(failedRecipient.error === 'simulated failure for this number', 'error message should be recorded', failedRecipient);

  // 4. Each successful send should have created a conversation + message, as
  // if that recipient had messaged in normally.
  const messageCount = await WaMessage.countDocuments({ type: 'template', direction: 'outbound' });
  assert(messageCount === 3, 'should have created 3 outbound template messages', messageCount);

  const conversationCount = await WaConversation.countDocuments();
  assert(conversationCount === 3, 'should have created 3 conversations (one per successful recipient)', conversationCount);

  // 5. List broadcasts
  const listRes = await agent.get('/api/v1/whatsapp/broadcasts');
  assert(listRes.status === 200 && listRes.body.data.length === 1, 'should list 1 broadcast', listRes.body);

  console.log('\nALL BROADCAST SMOKE ASSERTIONS PASSED');

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
