jest.mock('../../../src/api/v1/modules/blog/blog.model', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const Blog = require('../../../src/api/v1/modules/blog/blog.model');
const blogService = require('../../../src/api/v1/modules/blog/blog.service');

// Builds a chainable, awaitable mongoose-Query-like object so the same mock
// works whether the code chains .populate().sort() or awaits .populate() directly.
function makeQueryMock(resolvedValue) {
  const query = {};
  query.populate = jest.fn(() => query);
  query.sort = jest.fn(() => Promise.resolve(resolvedValue));
  query.then = (resolve, reject) => Promise.resolve(resolvedValue).then(resolve, reject);
  return query;
}

describe('blog.service', () => {
  afterEach(() => jest.clearAllMocks());

  it('findAllBlogs populates author and sorts by -createdAt', async () => {
    const query = makeQueryMock([{ _id: '1' }]);
    Blog.find.mockReturnValue(query);

    const result = await blogService.findAllBlogs();

    expect(Blog.find).toHaveBeenCalledWith({});
    expect(query.populate).toHaveBeenCalledWith('author', 'firstName lastName email');
    expect(query.sort).toHaveBeenCalledWith('-createdAt');
    expect(result).toEqual([{ _id: '1' }]);
  });

  it('findBlogById populates author', async () => {
    const query = makeQueryMock({ _id: '1' });
    Blog.findById.mockReturnValue(query);

    const result = await blogService.findBlogById('1');

    expect(Blog.findById).toHaveBeenCalledWith('1');
    expect(query.populate).toHaveBeenCalledWith('author', 'firstName lastName email');
    expect(result).toEqual({ _id: '1' });
  });

  it('findBlogBySlug queries by slug and populates author', async () => {
    const query = makeQueryMock({ slug: 'a-post' });
    Blog.findOne.mockReturnValue(query);

    const result = await blogService.findBlogBySlug('a-post');

    expect(Blog.findOne).toHaveBeenCalledWith({ slug: 'a-post' });
    expect(result).toEqual({ slug: 'a-post' });
  });

  it('createBlog delegates to Blog.create', async () => {
    Blog.create.mockResolvedValue({ _id: '1' });
    const payload = { title: 'x' };
    await blogService.createBlog(payload);
    expect(Blog.create).toHaveBeenCalledWith(payload);
  });

  it('updateBlogById runs validators and populates the result', async () => {
    const query = makeQueryMock({ _id: '1', title: 'updated' });
    Blog.findByIdAndUpdate.mockReturnValue(query);

    const result = await blogService.updateBlogById('1', { title: 'updated' });

    expect(Blog.findByIdAndUpdate).toHaveBeenCalledWith(
      '1',
      { title: 'updated' },
      { returnDocument: 'after', runValidators: true }
    );
    expect(query.populate).toHaveBeenCalledWith('author', 'firstName lastName email');
    expect(result).toEqual({ _id: '1', title: 'updated' });
  });

  it('deleteBlogById delegates to Blog.findByIdAndDelete', async () => {
    Blog.findByIdAndDelete.mockResolvedValue({ _id: '1' });
    await blogService.deleteBlogById('1');
    expect(Blog.findByIdAndDelete).toHaveBeenCalledWith('1');
  });
});
