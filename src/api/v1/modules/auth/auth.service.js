const crypto = require('crypto');
const User = require('../user/user.model');

const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Generates a plain reset token to send to the user, and stashes its hash
// (+ expiry) on the user doc. Caller is responsible for saving the doc.
exports.createPasswordResetToken = (user) => {
  const resetToken = crypto.randomBytes(32).toString('hex');

  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + RESET_TOKEN_TTL_MS;

  return resetToken;
};

exports.findUserByResetToken = (token) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
};
