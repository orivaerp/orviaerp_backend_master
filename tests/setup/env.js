process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.USE_PROXY = 'false';

// Pin the in-memory MongoDB server version for reproducible, cached test runs.
// (Separately, package.json pins the `mongodb` driver to 7.5.0 via "overrides"
// to work around a driver 7.6.0 regression that breaks the handshake under Jest.)
process.env.MONGOMS_VERSION = '7.0.14';
