const Blog = require('./blog.model');

const AUTHOR_FIELDS = 'firstName lastName email';

// All direct DB queries for the blog module live here.
// Controller stays thin and just calls these.

exports.findAllBlogs = async (filter = {}) => {
  return Blog.find(filter).populate('author', AUTHOR_FIELDS).sort('-createdAt');
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
