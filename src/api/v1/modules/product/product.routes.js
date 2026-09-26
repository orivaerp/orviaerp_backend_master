const express = require('express');
const router = express.Router();

const {
  getAllProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('./product.controller');

const { createProductSchema, updateProductSchema } = require('./product.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

// Reads are public; writes are admin-only.
router
  .route('/')
  .get(getAllProducts)
  .post(isAuthenticated, restrictTo('admin'), validate(createProductSchema), createProduct);

router.get('/slug/:slug', getProductBySlug);

router
  .route('/:id')
  .get(getProductById)
  .put(isAuthenticated, restrictTo('admin'), validate(updateProductSchema), updateProduct)
  .delete(isAuthenticated, restrictTo('admin'), deleteProduct);

module.exports = router;
