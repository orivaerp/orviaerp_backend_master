const {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('../../../src/api/v1/modules/auth/auth.validator');

describe('auth.validator', () => {
  describe('loginSchema', () => {
    it('requires email and password', () => {
      expect(loginSchema.validate({}).error).toBeDefined();
    });

    it('accepts a valid payload', () => {
      expect(loginSchema.validate({ email: 'a@b.com', password: 'x' }).error).toBeUndefined();
    });

    it('rejects an invalid email', () => {
      expect(loginSchema.validate({ email: 'nope', password: 'x' }).error).toBeDefined();
    });
  });

  describe('forgotPasswordSchema', () => {
    it('requires a valid email', () => {
      expect(forgotPasswordSchema.validate({}).error).toBeDefined();
      expect(forgotPasswordSchema.validate({ email: 'not-an-email' }).error).toBeDefined();
      expect(forgotPasswordSchema.validate({ email: 'a@b.com' }).error).toBeUndefined();
    });
  });

  describe('resetPasswordSchema', () => {
    it('requires a password of at least 6 characters', () => {
      expect(resetPasswordSchema.validate({ password: '123' }).error).toBeDefined();
      expect(resetPasswordSchema.validate({ password: '123456' }).error).toBeUndefined();
    });
  });

  describe('changePasswordSchema', () => {
    it('requires both currentPassword and newPassword', () => {
      expect(changePasswordSchema.validate({ currentPassword: 'a' }).error).toBeDefined();
      expect(
        changePasswordSchema.validate({ currentPassword: 'a', newPassword: 'newpass1' }).error
      ).toBeUndefined();
    });
  });
});
