const {
  createBlogSchema,
  updateBlogSchema,
} = require('../../../src/api/v1/modules/blog/blog.validator');

describe('blog.validator', () => {
  const validPayload = {
    title: 'A valid title',
    content: 'This is well over twenty characters of content.',
  };

  describe('createBlogSchema', () => {
    it('accepts a minimal valid payload', () => {
      expect(createBlogSchema.validate(validPayload).error).toBeUndefined();
    });

    it('requires title and content', () => {
      const { error } = createBlogSchema.validate({}, { abortEarly: false });
      const fields = error.details.map((d) => d.path[0]);
      expect(fields).toEqual(expect.arrayContaining(['title', 'content']));
    });

    it('rejects content shorter than 20 characters', () => {
      expect(
        createBlogSchema.validate({ ...validPayload, content: 'too short' }).error
      ).toBeDefined();
    });

    it('rejects an invalid status', () => {
      expect(createBlogSchema.validate({ ...validPayload, status: 'live' }).error).toBeDefined();
    });

    it('rejects a non-uri coverImage', () => {
      expect(
        createBlogSchema.validate({ ...validPayload, coverImage: 'not-a-url' }).error
      ).toBeDefined();
    });

    it('accepts an array of tags', () => {
      expect(
        createBlogSchema.validate({ ...validPayload, tags: ['a', 'b'] }).error
      ).toBeUndefined();
    });
  });

  describe('updateBlogSchema', () => {
    it('requires at least one field', () => {
      expect(updateBlogSchema.validate({}).error).toBeDefined();
    });

    it('accepts a partial update', () => {
      expect(updateBlogSchema.validate({ status: 'archived' }).error).toBeUndefined();
    });
  });
});
