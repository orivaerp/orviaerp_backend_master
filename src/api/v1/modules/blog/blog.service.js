const Blog = require('./blog.model');

const AUTHOR_FIELDS = 'firstName lastName email';

// All direct DB queries for the blog module live here.
// Controller stays thin and just calls these.

// `page` is { skip, limit } from common/utils/pagination; omit it for the full list.
exports.findAllBlogs = async (filter = {}, page) => {
  const query = Blog.find(filter)
    .populate('author', AUTHOR_FIELDS)
    .sort({ createdAt: -1, _id: -1 });
  return page ? query.skip(page.skip).limit(page.limit) : query;
};

exports.countBlogs = async (filter = {}) => {
  return Blog.countDocuments(filter);
};

exports.findBlogById = async (id) => {
  return Blog.findById(id).populate('author', AUTHOR_FIELDS);
};

exports.findBlogBySlug = async (slug) => {
  return Blog.findOne({ slug }).populate('author', AUTHOR_FIELDS);
};

exports.createBlog = async (data) => {
  return Blog.create(data);
};

exports.updateBlogById = async (id, data) => {
  return Blog.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true }).populate(
    'author',
    AUTHOR_FIELDS
  );
};

exports.deleteBlogById = async (id) => {
  return Blog.findByIdAndDelete(id);
};
