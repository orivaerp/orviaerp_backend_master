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
    // Frontend (admin.orviaerp.com) and backend (orvia.icher.co.in) are
    // different registrable domains in production - a genuinely cross-site
    // setup. Cross-site fetch/XHR requests only carry the session cookie if
    // it's SameSite=None (which requires Secure). The default (SameSite=Lax)
    // only works for a ~2min grace window after login (Chrome's "Lax+POST"
    // mitigation), which is exactly the "works right after login, then
    // silently logs out" symptom this was causing. Local dev stays on Lax
    // since localhost:4200/:5001 share a registrable domain (same-site).
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
});
