const Joi = require('joi');

exports.loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

exports.forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().required(),
});

exports.resetPasswordSchema = Joi.object({
  password: Joi.string().min(6).required(),
});

exports.changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});
