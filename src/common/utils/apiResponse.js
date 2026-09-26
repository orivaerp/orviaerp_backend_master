// Consistent success/error response shape across the API
exports.success = (res, { statusCode = 200, message = 'Success', data = null }) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

exports.error = (res, { statusCode = 500, message = 'Something went wrong', errors = null }) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};