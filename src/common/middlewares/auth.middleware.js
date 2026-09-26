const { error } = require('../utils/apiResponse');

// Protects routes that require an active passport session.
module.exports = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return error(res, { statusCode: 401, message: 'Not authenticated' });
};
