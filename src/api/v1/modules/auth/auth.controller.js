const passport = require('passport');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const authService = require('./auth.service');
const User = require('../user/user.model');

// @desc    Log in with email + password, starts a session
// @route   POST /api/v1/auth/login
exports.login = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return error(res, { statusCode: 401, message: info?.message || 'Invalid email or password' });
    }

    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);

      const userObj = user.toObject();
      delete userObj.password;

      return success(res, { message: 'Logged in successfully', data: userObj });
    });
  })(req, res, next);
};

// @desc    Log out and destroy the session
// @route   POST /api/v1/auth/logout
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);

    req.session.destroy((sessionErr) => {
      if (sessionErr) return next(sessionErr);
      res.clearCookie('connect.sid');
      return success(res, { message: 'Logged out successfully' });
    });
  });
};

// @desc    Request a password reset token
// @route   POST /api/v1/auth/forgot-password
exports.forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Same response whether or not the email is registered, so this endpoint
  // can't be used to enumerate accounts.
  const genericMessage = 'If that email is registered, a reset link has been sent';

  if (!user) {
    return success(res, { message: genericMessage });
  }

  const resetToken = authService.createPasswordResetToken(user);
  await user.save({ validateBeforeSave: false });

  // TODO: send resetToken via email once a mailer is wired up.
  // Returned in the response for now so the reset flow is testable end-to-end.
  return success(res, { message: genericMessage, data: { resetToken } });
});

// @desc    Reset password using the token from forgot-password
// @route   PATCH /api/v1/auth/reset-password/:token
exports.resetPassword = catchAsync(async (req, res) => {
  const user = await authService.findUserByResetToken(req.params.token);

  if (!user) {
    return error(res, { statusCode: 400, message: 'Reset token is invalid or has expired' });
  }

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return success(res, { message: 'Password reset successfully' });
});

// @desc    Change password while logged in
// @route   PATCH /api/v1/auth/change-password
exports.changePassword = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).select('+password');

  const isMatch = await user.comparePassword(req.body.currentPassword);
  if (!isMatch) {
    return error(res, { statusCode: 401, message: 'Current password is incorrect' });
  }

  user.password = req.body.newPassword;
  await user.save();

  return success(res, { message: 'Password changed successfully' });
});
