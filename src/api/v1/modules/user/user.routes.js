const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require('./user.controller');

const { createUserSchema, updateUserSchema } = require('./user.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

const adminOnly = [isAuthenticated, restrictTo('admin')];

// POST stays public because the /register page uses it; the controller forces
// role 'user' unless the caller is a logged-in admin. Everything else is admin-only.
router
  .route('/')
  .get(...adminOnly, getAllUsers)
  .post(validate(createUserSchema), createUser);

router
  .route('/:id')
  .get(...adminOnly, getUserById)
  .put(...adminOnly, validate(updateUserSchema), updateUser)
  .delete(...adminOnly, deleteUser);

module.exports = router;