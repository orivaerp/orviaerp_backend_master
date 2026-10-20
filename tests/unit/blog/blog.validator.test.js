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

// Post bodies are Quill HTML, so what matters is the visible text, not the markup around it.
describe('blog.validator — content is judged by its visible text', () => {
  const { createBlogSchema, updateBlogSchema } = require('../../../src/api/v1/modules/blog/blog.validator');
  const post = (content) => ({ title: 'A valid title', content });
  const message = (content) => createBlogSchema.validate(post(content)).error?.details[0].message;

  it('accepts short but real text that used to be rejected for its markup', () => {
    expect(createBlogSchema.validate(post('<p>Hello world</p>')).error).toBeUndefined();
    expect(createBlogSchema.validate(post('<p>Namaste dosto</p>')).error).toBeUndefined();
  });

  it('accepts plain text with no markup at all', () => {
    expect(createBlogSchema.validate(post('Hello world!')).error).toBeUndefined();
  });

  it('rejects Quill\'s "empty" editor value, which is markup with no text', () => {
    expect(message('<p><br></p>')).toBe('Post content must have at least 10 characters of text');
    expect(message('<p></p><p></p>')).toBeDefined();
    expect(message('<p>&nbsp;&nbsp;&nbsp;</p>')).toBeDefined();
  });

  it('rejects text that is genuinely too short, however much markup wraps it', () => {
    expect(message('<p><strong><em>Hi</em></strong></p>')).toBeDefined();
    expect(message('<h2><span class="x">Short</span></h2>')).toBeDefined();
  });

  it('does not count the text of tags and attributes', () => {
    // 60+ characters of HTML, 3 of text
    expect(message('<a href="https://example.com/a/very/long/link/address">abc</a>')).toBeDefined();
  });

  it('accepts a post that is only an image', () => {
    expect(createBlogSchema.validate(post('<p><img src="https://example.com/a.jpg"></p>')).error).toBeUndefined();
  });

  it('gives a readable reason rather than a raw length message', () => {
    expect(message('<p><br></p>')).not.toMatch(/length must be/);
  });

  it('applies the same rule when updating a post', () => {
    expect(updateBlogSchema.validate({ content: '<p>Hello world</p>' }).error).toBeUndefined();
    expect(updateBlogSchema.validate({ content: '<p><br></p>' }).error).toBeDefined();
  });

  it('still enforces the SEO field limits', () => {
    expect(createBlogSchema.validate({ ...post('<p>Hello world</p>'), metaTitle: 'x'.repeat(71) }).error).toBeDefined();
    expect(createBlogSchema.validate({ ...post('<p>Hello world</p>'), metaTitle: 'x'.repeat(70) }).error).toBeUndefined();
    expect(createBlogSchema.validate({ ...post('<p>Hello world</p>'), metaDescription: 'x'.repeat(161) }).error).toBeDefined();
    expect(createBlogSchema.validate({ ...post('<p>Hello world</p>'), metaDescription: 'x'.repeat(160) }).error).toBeUndefined();
  });
});
