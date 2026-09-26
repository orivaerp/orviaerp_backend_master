const Joi = require('joi');

// NOTE: requires `joi` package -> npm install joi

exports.createUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required(),
  lastName: Joi.string().trim().min(1).max(50).allow('', null),
  email: Joi.string().trim().email().required(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]{7,15}$/)
    .allow('', null),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'user', 'vendor'),
});

exports.updateUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50),
  lastName: Joi.string().trim().min(1).max(50).allow('', null),
  email: Joi.string().trim().email(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]{7,15}$/)
    .allow('', null),
  role: Joi.string().valid('admin', 'user', 'vendor'),
  status: Joi.string().valid('active', 'inactive', 'blocked'),
}).min(1); // at least one field required for update