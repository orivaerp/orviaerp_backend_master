const request = require('supertest');
const app = require('./app');
const User = require('../../src/api/v1/modules/user/user.model');

// Public sign-up (POST /users) always creates a plain 'user' now — a role in the
// request body is ignored unless the caller is a logged-in admin. Tests that need
// an admin/vendor/sales account therefore insert them directly.
exports.registerUser = async (payload) => {
  if (!payload.role || payload.role === 'user') {
    return request(app).post('/api/v1/users').send(payload);
  }

  const user = await User.create(payload);
  // JSON round-trip so ids are strings, exactly as the HTTP endpoint would return them.
  const data = JSON.parse(JSON.stringify(user.toObject()));
  delete data.password;
  return { status: 201, body: { data } };
};
