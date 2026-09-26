const {
  createUserSchema,
  updateUserSchema,
} = require('../../../src/api/v1/modules/user/user.validator');

describe('user.validator', () => {
  describe('createUserSchema', () => {
    const valid = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'secret1',
    };

    it('accepts a valid payload', () => {
      expect(createUserSchema.validate(valid).error).toBeUndefined();
    });

    it('requires firstName, email and password', () => {
      const { error } = createUserSchema.validate({}, { abortEarly: false });
      const fields = error.details.map((d) => d.path[0]);
      expect(fields).toEqual(expect.arrayContaining(['firstName', 'email', 'password']));
    });

    it('rejects an invalid email', () => {
      expect(createUserSchema.validate({ ...valid, email: 'not-an-email' }).error).toBeDefined();
    });

    it('rejects a password shorter than 6 characters', () => {
      expect(createUserSchema.validate({ ...valid, password: '123' }).error).toBeDefined();
    });

    it('rejects a phone number in the wrong format', () => {
      expect(createUserSchema.validate({ ...valid, phone: 'not-a-phone' }).error).toBeDefined();
    });

    it('rejects an invalid role', () => {
      expect(createUserSchema.validate({ ...valid, role: 'superadmin' }).error).toBeDefined();
    });
  });

  describe('updateUserSchema', () => {
    it('requires at least one field', () => {
      expect(updateUserSchema.validate({}).error).toBeDefined();
    });

    it('accepts a partial update', () => {
      expect(updateUserSchema.validate({ status: 'inactive' }).error).toBeUndefined();
    });

    it('rejects an invalid status', () => {
      expect(updateUserSchema.validate({ status: 'deleted' }).error).toBeDefined();
    });
  });
});
