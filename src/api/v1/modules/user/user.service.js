const User = require('./user.model');

// All direct DB queries for the user module live here.
// Controller stays thin and just calls these.

// `page` is { skip, limit } from common/utils/pagination; omit it for the full list.
exports.findAllUsers = async (filter = {}, page) => {
  const query = User.find(filter).sort({ createdAt: -1, _id: -1 });
  return page ? query.skip(page.skip).limit(page.limit) : query;
};

exports.countUsers = async (filter = {}) => {
  return User.countDocuments(filter);
};

exports.findUserById = async (id) => {
  return User.findById(id);
};

exports.findUserByEmail = async (email) => {
  return User.findOne({ email });
};

exports.createUser = async (data) => {
  return User.create(data);
};

exports.updateUserById = async (id, data) => {
  return User.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
};

exports.deleteUserById = async (id) => {
  return User.findByIdAndDelete(id);
};