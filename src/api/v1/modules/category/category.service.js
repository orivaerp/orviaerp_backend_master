const Category = require('./category.model');

const normalizeParent = (data) => {
  if (data.parent === '') data.parent = null;
  return data;
};

exports.findAll = async (filter = {}) => {
  return Category.find({ isDeleted: false, ...filter })
    .populate('parent', 'name slug')
    .sort({ level: 1, order: 1, name: 1 });
};

exports.findById = async (id) => {
  return Category.findOne({ _id: id, isDeleted: false }).populate('parent', 'name slug');
};

exports.getTree = async () => {
  return Category.getTree();
};

exports.create = async (data) => {
  return Category.create(normalizeParent(data));
};

exports.updateById = async (id, data) => {
  const category = await Category.findOne({ _id: id, isDeleted: false });
  if (!category) return null;
  Object.assign(category, normalizeParent(data));
  await category.save();
  return category.populate('parent', 'name slug');
};

exports.softDeleteById = async (id) => {
  return Category.softDelete(id);
};
