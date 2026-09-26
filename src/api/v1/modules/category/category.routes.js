const express = require('express');
const   router = express.Router();

const {
  getAllCategories,
  getCategoryTree,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('./category.controller');

const { createCategorySchema, updateCategorySchema } = require('./category.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

// Reads are public; writes are admin-only.
router
  .route('/')
  .get(getAllCategories)
  .post(isAuthenticated, restrictTo('admin'), validate(createCategorySchema), createCategory);

router.get('/tree', getCategoryTree);

router
  .route('/:id')
  .get(getCategoryById)
  .put(isAuthenticated, restrictTo('admin'), validate(updateCategorySchema), updateCategory)
  .delete(isAuthenticated, restrictTo('admin'), deleteCategory);

module.exports = router;
