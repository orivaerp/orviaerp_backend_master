const express = require('express');
const router = express.Router();

const {
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadCoverImage,
  deleteCoverImage,
} = require('./blog.controller');

const { createBlogSchema, updateBlogSchema } = require('./blog.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const makeUploader = require('../../../../common/middlewares/upload.middleware');

const uploadCover = makeUploader({
  bucket: 'public',
  folder: 'blog-covers',
  maxSizeMB: 3,
});

// Reads are public; writes require a logged-in user (author is taken from the session).
router.route('/').get(getAllBlogs).post(isAuthenticated, validate(createBlogSchema), createBlog);

router.get('/slug/:slug', getBlogBySlug);

router
  .route('/:id')
  .get(getBlogById)
  .put(isAuthenticated, validate(updateBlogSchema), updateBlog)
  .delete(isAuthenticated, deleteBlog);

router.put('/:id/cover-image', isAuthenticated, uploadCover.single('coverImage'), uploadCoverImage);
router.delete('/:id/cover-image', isAuthenticated, deleteCoverImage);


module.exports = router;
