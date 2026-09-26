const categoryService = require('./category.service');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');

// @desc    Get all categories (flat list)
// @route   GET /api/v1/categories
exports.getAllCategories = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.parent === 'null') filter.parent = null;
  else if (req.query.parent) filter.parent = req.query.parent;

  const categories = await categoryService.findAll(filter);
  return success(res, { message: 'Categories fetched successfully', data: categories });
});

// @desc    Get category tree (nested)
// @route   GET /api/v1/categories/tree
exports.getCategoryTree = catchAsync(async (req, res) => {
  const tree = await categoryService.getTree();
  return success(res, { message: 'Category tree fetched successfully', data: tree });
});

// @desc    Get single category by ID
// @route   GET /api/v1/categories/:id
exports.getCategoryById = catchAsync(async (req, res) => {
  const category = await categoryService.findById(req.params.id);
  if (!category) {
    return error(res, { statusCode: 404, message: 'Category not found' });
  }
  return success(res, { message: 'Category fetched successfully', data: category });
});

// @desc    Create a new category
// @route   POST /api/v1/categories
exports.createCategory = catchAsync(async (req, res) => {
  const category = await categoryService.create(req.body);
  return success(res, { statusCode: 201, message: 'Category created successfully', data: category });
});

// @desc    Update category by ID
// @route   PUT /api/v1/categories/:id
exports.updateCategory = catchAsync(async (req, res) => {
  const category = await categoryService.updateById(req.params.id, req.body);
  if (!category) {
    return error(res, { statusCode: 404, message: 'Category not found' });
  }
  return success(res, { message: 'Category updated successfully', data: category });
});

// @desc    Soft-delete category by ID (and its descendants)
// @route   DELETE /api/v1/categories/:id
exports.deleteCategory = catchAsync(async (req, res) => {
  const category = await categoryService.findById(req.params.id);
  if (!category) {
    return error(res, { statusCode: 404, message: 'Category not found' });
  }
  await categoryService.softDeleteById(req.params.id);
  return success(res, { message: 'Category deleted successfully' });
});
