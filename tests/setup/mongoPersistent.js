const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Same in-memory DB bootstrap as tests/setup/mongo.js, but deliberately does
// NOT wipe collections between individual tests: e2e specs are ordered,
// stateful journeys (register -> login -> create -> ... -> cleanup) within a
// single describe block, so state must survive from one `it` to the next.
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}, 30000);
