const User = require('./user.model');

// All direct DB queries for the user module live here.
// Controller stays thin and just calls these.

exports.findAllUsers = async (filter = {}) => {
  return User.find(filter);
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