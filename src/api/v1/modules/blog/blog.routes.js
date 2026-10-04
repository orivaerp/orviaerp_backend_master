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
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');
const makeUploader = require('../../../../common/middlewares/upload.middleware');

const uploadCover = makeUploader({
  bucket: 'public',
  folder: 'blog-covers',
  maxSizeMB: 3,
});

// Reads are public; writes need an admin or regular user (vendor/sales are enquiry-only) (author is taken from the session).
router
  .route('/')
  .get(getAllBlogs)
  .post(isAuthenticated, restrictTo('admin', 'user'), validate(createBlogSchema), createBlog);

router.get('/slug/:slug', getBlogBySlug);

router
  .route('/:id')
  .get(getBlogById)
  .put(isAuthenticated, restrictTo('admin', 'user'), validate(updateBlogSchema), updateBlog)
  .delete(isAuthenticated, restrictTo('admin', 'user'), deleteBlog);

router.put(
  '/:id/cover-image',
  isAuthenticated,
  restrictTo('admin', 'user'),
  uploadCover.single('coverImage'),
  uploadCoverImage
);
router.delete('/:id/cover-image', isAuthenticated, restrictTo('admin', 'user'), deleteCoverImage);


module.exports = router;
