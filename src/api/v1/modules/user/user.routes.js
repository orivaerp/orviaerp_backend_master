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

// NOTE: No auth middleware here by design.
// Once the auth module is ready, protect these like:
// router.use(protect); or router.use(protect, restrictTo('admin'))

router.route('/').get(getAllUsers).post(validate(createUserSchema), createUser);

router
  .route('/:id')
  .get(getUserById)
  .put(validate(updateUserSchema), updateUser)
  .delete(deleteUser);

module.exports = router;