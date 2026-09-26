const Product = require('./product.model');

const normalizeRefs = (data) => {
  if (data.subCategory === '') data.subCategory = null;
  if (data.subSubCategory === '') data.subSubCategory = null;
  return data;
};

const CATEGORY_FIELDS = 'name slug';
const populateRefs = (query) =>
  query
    .populate('category', CATEGORY_FIELDS)
    .populate('subCategory', CATEGORY_FIELDS)
    .populate('subSubCategory', CATEGORY_FIELDS);

exports.findAll = async (filter = {}) => {
  return populateRefs(Product.find({ isDeleted: false, ...filter })).sort('-createdAt');
};

exports.findById = async (id) => {
  return populateRefs(Product.findOne({ _id: id, isDeleted: false }));
};

exports.findBySlug = async (slug) => {
  return populateRefs(Product.findOne({ slug, isDeleted: false }));
};

exports.create = async (data) => {
  const payload = normalizeRefs(data);
  if (!payload.code) {
    payload.code = await Product.generateCode(payload.category);
  } else {
    payload.code = payload.code.toUpperCase();
  }
  const product = await Product.create(payload);
  return exports.findById(product._id);
};

exports.updateById = async (id, data) => {
  const product = await Product.findOne({ _id: id, isDeleted: false });
  if (!product) return null;
  Object.assign(product, normalizeRefs(data));
  await product.save();
  return exports.findById(product._id);
};

exports.softDeleteById = async (id) => {
  return Product.findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true }, { new: true });
};
