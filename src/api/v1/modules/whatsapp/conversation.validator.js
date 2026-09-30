const Joi = require('joi');

exports.sendMessageSchema = Joi.object({
  text: Joi.string().trim().min(1).max(4096).required(),
});

exports.assignSchema = Joi.object({
  // null unassigns; otherwise must be a valid Mongo ObjectId string
  assignedTo: Joi.string().hex().length(24).allow(null).required(),
});

exports.sendTemplateSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  language: Joi.string().trim().min(1).required(), // e.g. "en_US"
  bodyParams: Joi.array().items(Joi.string().trim().allow('')).default([]),
});
