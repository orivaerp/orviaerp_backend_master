const productService = require('./product.service');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const { parsePagination, buildMeta } = require('../../../../common/utils/pagination');

// @desc    Get all products (optionally filtered by category/status)
// @route   GET /api/v1/products
exports.getAllProducts = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.subCategory) filter.subCategory = req.query.subCategory;
  if (req.query.status) filter.status = req.query.status;

  const pagination = parsePagination(req.query);
  if (!pagination) {
    const products = await productService.findAll(filter);
    return success(res, { message: 'Products fetched successfully', data: products });
  }

  const [products, total] = await Promise.all([
    productService.findAll(filter, pagination),
    productService.count(filter),
  ]);
  return success(res, {
    message: 'Products fetched successfully',
    data: products,
    meta: buildMeta(pagination, total),
  });
});

// @desc    Get single product by ID
// @route   GET /api/v1/products/:id
exports.getProductById = catchAsync(async (req, res) => {
  const product = await productService.findById(req.params.id);
  if (!product) {
    return error(res, { statusCode: 404, message: 'Product not found' });
  }
  return success(res, { message: 'Product fetched successfully', data: product });
});

// @desc    Get single product by slug
// @route   GET /api/v1/products/slug/:slug
exports.getProductBySlug = catchAsync(async (req, res) => {
  const product = await productService.findBySlug(req.params.slug);
  if (!product) {
    return error(res, { statusCode: 404, message: 'Product not found' });
  }
  return success(res, { message: 'Product fetched successfully', data: product });
});

// @desc    Create a new product
// @route   POST /api/v1/products
exports.createProduct = catchAsync(async (req, res) => {
  const product = await productService.create(req.body);
  return success(res, { statusCode: 201, message: 'Product created successfully', data: product });
});

// @desc    Update product by ID
// @route   PUT /api/v1/products/:id
exports.updateProduct = catchAsync(async (req, res) => {
  const product = await productService.updateById(req.params.id, req.body);
  if (!product) {
    return error(res, { statusCode: 404, message: 'Product not found' });
  }
  return success(res, { message: 'Product updated successfully', data: product });
});

// @desc    Soft-delete product by ID
// @route   DELETE /api/v1/products/:id
exports.deleteProduct = catchAsync(async (req, res) => {
  const product = await productService.softDeleteById(req.params.id);
  if (!product) {
    return error(res, { statusCode: 404, message: 'Product not found' });
  }
  return success(res, { message: 'Product deleted successfully' });
});
