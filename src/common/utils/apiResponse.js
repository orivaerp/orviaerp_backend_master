// Consistent success/error response shape across the API
// `meta` is only included when given (paginated lists), so other responses are unchanged.
exports.success = (res, { statusCode = 200, message = 'Success', data = null, meta } = {}) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

exports.error = (res, { statusCode = 500, message = 'Something went wrong', errors = null }) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
