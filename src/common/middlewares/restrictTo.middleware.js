const { error } = require('../utils/apiResponse');

// Restricts a route to specific user roles. Must run after isAuthenticated.
module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return error(res, { statusCode: 403, message: 'You are not allowed to perform this action' });
  }
  next();
};
