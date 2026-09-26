const userService = require('./user.service');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');

// @desc    Get all users
// @route   GET /api/v1/users
exports.getAllUsers = catchAsync(async (req, res) => {
  const users = await userService.findAllUsers();
  return success(res, { message: 'Users fetched successfully', data: users });
});

// @desc    Get single user by ID
// @route   GET /api/v1/users/:id
exports.getUserById = catchAsync(async (req, res) => {
  const user = await userService.findUserById(req.params.id);

  if (!user) {
    return error(res, { statusCode: 404, message: 'User not found' });
  }

  return success(res, { message: 'User fetched successfully', data: user });
});

// @desc    Create a new user
// @route   POST /api/v1/users
exports.createUser = catchAsync(async (req, res) => {
  const { firstName, lastName, email, phone, password, role } = req.body;

  const existingUser = await userService.findUserByEmail(email);
  if (existingUser) {
    return error(res, { statusCode: 409, message: 'User with this email already exists' });
  }

  const user = await userService.createUser({ firstName, lastName, email, phone, password, role });

  const userObj = user.toObject();
  delete userObj.password; // never leak password in response

  return success(res, { statusCode: 201, message: 'User created successfully', data: userObj });
});

// @desc    Update user by ID
// @route   PUT /api/v1/users/:id
exports.updateUser = catchAsync(async (req, res) => {
  const { firstName, lastName, email, phone, role, status } = req.body;

  const user = await userService.updateUserById(req.params.id, {
    firstName,
    lastName,
    email,
    phone,
    role,
    status,
  });

  if (!user) {
    return error(res, { statusCode: 404, message: 'User not found' });
  }

  return success(res, { message: 'User updated successfully', data: user });
});

// @desc    Delete user by ID
// @route   DELETE /api/v1/users/:id
exports.deleteUser = catchAsync(async (req, res) => {
  const user = await userService.deleteUserById(req.params.id);

  if (!user) {
    return error(res, { statusCode: 404, message: 'User not found' });
  }

  return success(res, { message: 'User deleted successfully' });
});