// Test-only entry point: same Express app as production, but never touches
// server.js (which owns the real DB connection + proxy/env logic). Integration
// and e2e tests connect mongoose to an in-memory server themselves (see
// tests/setup/mongo.js) before requiring this.
module.exports = require('../../src/app');
