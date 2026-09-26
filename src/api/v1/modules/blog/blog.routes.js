const express = require('express');
const router = express.Router();

const {
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
} = require('./blog.controller');

const { createBlogSchema, updateBlogSchema } = require('./blog.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');

// Reads are public; writes require a logged-in user (author is taken from the session).
router.route('/').get(getAllBlogs).post(isAuthenticated, validate(createBlogSchema), createBlog);

router.get('/slug/:slug', getBlogBySlug);

router
  .route('/:id')
  .get(getBlogById)
  .put(isAuthenticated, validate(updateBlogSchema), updateBlog)
  .delete(isAuthenticated, deleteBlog);

module.exports = router;
