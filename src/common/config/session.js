const session = require('express-session');
const { MongoStore } = require('connect-mongo');

// Pulled out of app.js so the exact same middleware instance (and store) can
// also be attached to the Socket.IO handshake in common/config/socket.js -
// that's what lets a WebSocket connection see the same login session as the
// regular HTTP API.

// Falls back to express-session's default in-memory store when MONGO_URI isn't
// set (e.g. the test suite, which connects mongoose directly to an in-memory
// Mongo instead of via this env var) - fine there since tests don't need
// persistence. Mirrors db.js's SOCKS5 proxy options so it works wherever the
// main DB connection does.
let sessionStore;

if (process.env.MONGO_URI) {
  const clientOptions = {};

  if (process.env.USE_PROXY === 'true') {
    clientOptions.proxyHost = process.env.PROXY_HOST || '127.0.0.1';
    clientOptions.proxyPort = parseInt(process.env.PROXY_PORT) || 1080;
  }

  sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    clientOptions,
    ttl: 24 * 60 * 60, // seconds, matches the cookie's maxAge below
  });
}

module.exports = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  },
});
