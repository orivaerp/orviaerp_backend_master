const blogService = require('./blog.service');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');

// @desc    Get all blogs
// @route   GET /api/v1/blogs
exports.getAllBlogs = catchAsync(async (req, res) => {
  const blogs = await blogService.findAllBlogs();
  return success(res, { message: 'Blogs fetched successfully', data: blogs });
});

// @desc    Get single blog by ID
// @route   GET /api/v1/blogs/:id
exports.getBlogById = catchAsync(async (req, res) => {
  const blog = await blogService.findBlogById(req.params.id);

  if (!blog) {
    return error(res, { statusCode: 404, message: 'Blog not found' });
  }

  return success(res, { message: 'Blog fetched successfully', data: blog });
});

// @desc    Get single blog by slug
// @route   GET /api/v1/blogs/slug/:slug
exports.getBlogBySlug = catchAsync(async (req, res) => {
  const blog = await blogService.findBlogBySlug(req.params.slug);

  if (!blog) {
    return error(res, { statusCode: 404, message: 'Blog not found' });
  }

  return success(res, { message: 'Blog fetched successfully', data: blog });
});

// @desc    Create a new blog post
// @route   POST /api/v1/blogs
exports.createBlog = catchAsync(async (req, res) => {
  const blog = await blogService.createBlog({ ...req.body, author: req.user.id });
  return success(res, { statusCode: 201, message: 'Blog created successfully', data: blog });
});

// @desc    Update blog by ID
// @route   PUT /api/v1/blogs/:id
exports.updateBlog = catchAsync(async (req, res) => {
  const blog = await blogService.findBlogById(req.params.id);

  if (!blog) {
    return error(res, { statusCode: 404, message: 'Blog not found' });
  }

  const isOwner = blog.author._id.toString() === req.user.id;
  if (!isOwner && req.user.role !== 'admin') {
    return error(res, { statusCode: 403, message: 'Not allowed to update this blog' });
  }

  const updatedBlog = await blogService.updateBlogById(req.params.id, req.body);
  return success(res, { message: 'Blog updated successfully', data: updatedBlog });
});

// @desc    Delete blog by ID
// @route   DELETE /api/v1/blogs/:id
exports.deleteBlog = catchAsync(async (req, res) => {
  const blog = await blogService.findBlogById(req.params.id);

  if (!blog) {
    return error(res, { statusCode: 404, message: 'Blog not found' });
  }

  const isOwner = blog.author._id.toString() === req.user.id;
  if (!isOwner && req.user.role !== 'admin') {
    return error(res, { statusCode: 403, message: 'Not allowed to delete this blog' });
  }

  await blogService.deleteBlogById(req.params.id);
  return success(res, { message: 'Blog deleted successfully' });
});
