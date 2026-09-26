const { error } = require('../utils/apiResponse');

// Generic validator: pass a Joi schema, it validates req.body
module.exports = (schema) => (req, res, next) => {
  const { error: validationError, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (validationError) {
    const errors = validationError.details.map((d) => d.message);
    return error(res, { statusCode: 400, message: 'Validation failed', errors });
  }

  req.body = value;
  next();
};