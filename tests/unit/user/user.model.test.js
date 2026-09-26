const bcrypt = require('bcryptjs');
const User = require('../../../src/api/v1/modules/user/user.model');

// The password-hashing pre('save') hook needs a real persistence round-trip
// to exercise meaningfully, so it's covered in the integration suite instead.
// comparePassword() only reads `this.password`, so it's cleanly unit-testable
// on an unsaved document.
describe('User model - comparePassword', () => {
  it('resolves true for the correct password', async () => {
    const hash = await bcrypt.hash('secret123', 10);
    const user = new User({ password: hash });
    await expect(user.comparePassword('secret123')).resolves.toBe(true);
  });

  it('resolves false for an incorrect password', async () => {
    const hash = await bcrypt.hash('secret123', 10);
    const user = new User({ password: hash });
    await expect(user.comparePassword('wrong-password')).resolves.toBe(false);
  });
});
