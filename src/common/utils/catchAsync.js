// Wraps async controller functions so we don't need try/catch in every controller.
// Any thrown/rejected error is passed to Express's error-handling middleware.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};