const mongoose = require('mongoose');
const Blog = require('../../../src/api/v1/modules/blog/blog.model');

// slug generation runs in a pre('validate') hook, which mongoose runs without
// needing a DB connection - so this is a clean, fast unit test.
// The publishedAt pre('save') hook does need persistence and is covered in
// the integration suite instead.
describe('Blog model - slug generation', () => {
  it('derives a url-safe slug from the title', async () => {
    const blog = new Blog({
      title: 'Hello, World! This Is A Test',
      content: 'x'.repeat(30),
      author: new mongoose.Types.ObjectId(),
    });

    await blog.validate();

    expect(blog.slug).toBe('hello-world-this-is-a-test');
  });

  it('regenerates the slug when the title changes', async () => {
    const blog = new Blog({
      title: 'Original Title',
      content: 'x'.repeat(30),
      author: new mongoose.Types.ObjectId(),
    });
    await blog.validate();
    expect(blog.slug).toBe('original-title');

    blog.title = 'Updated Title';
    await blog.validate();
    expect(blog.slug).toBe('updated-title');
  });

  it('strips leading/trailing punctuation from the slug', async () => {
    const blog = new Blog({
      title: '--- Weird Title!! ---',
      content: 'x'.repeat(30),
      author: new mongoose.Types.ObjectId(),
    });

    await blog.validate();

    expect(blog.slug).toBe('weird-title');
  });
});
