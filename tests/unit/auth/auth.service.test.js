const crypto = require('crypto');

jest.mock('../../../src/api/v1/modules/user/user.model', () => ({
  findOne: jest.fn(),
}));

const User = require('../../../src/api/v1/modules/user/user.model');
const authService = require('../../../src/api/v1/modules/auth/auth.service');

describe('auth.service', () => {
  afterEach(() => jest.clearAllMocks());

  describe('createPasswordResetToken', () => {
    it('stashes a sha256 hash of the token + a ~10 min expiry on the user, returns the plain token', () => {
      const user = {};
      const before = Date.now();

      const token = authService.createPasswordResetToken(user);

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(64); // 32 random bytes as hex

      const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
      expect(user.passwordResetToken).toBe(expectedHash);
      expect(user.passwordResetExpires).toBeGreaterThan(before);
      expect(user.passwordResetExpires).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
    });

    it('generates a different token on every call', () => {
      const t1 = authService.createPasswordResetToken({});
      const t2 = authService.createPasswordResetToken({});
      expect(t1).not.toBe(t2);
    });
  });

  describe('findUserByResetToken', () => {
    it('looks the user up by the hashed token within the unexpired window', async () => {
      User.findOne.mockResolvedValue({ _id: '1' });
      const token = 'plain-token-value';
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const result = await authService.findUserByResetToken(token);

      expect(User.findOne).toHaveBeenCalledWith({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: expect.any(Number) },
      });
      expect(result).toEqual({ _id: '1' });
    });
  });
});
