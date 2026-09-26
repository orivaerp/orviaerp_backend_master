const express = require('express');
const router = express.Router();

const {
  login,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('./auth.controller');

const {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('./auth.validator');

const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');

router.post('/login', validate(loginSchema), login);
router.post('/logout', isAuthenticated, logout);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.patch('/reset-password/:token', validate(resetPasswordSchema), resetPassword);
router.patch('/change-password', isAuthenticated, validate(changePasswordSchema), changePassword);

module.exports = router;
