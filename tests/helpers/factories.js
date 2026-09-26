let counter = 0;

exports.buildUserPayload = (overrides = {}) => {
  counter += 1;
  return {
    firstName: 'Test',
    lastName: 'User',
    email: `test.user.${Date.now()}.${counter}@example.com`,
    phone: '9999999999',
    password: 'Secret123!',
    role: 'user',
    ...overrides,
  };
};
