const Joi = require('joi');

exports.createBlogSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  content: Joi.string().trim().min(20).required(),
  excerpt: Joi.string().trim().max(300).allow('', null),
  coverImage: Joi.string().trim().uri().allow('', null),
  category: Joi.string().trim().allow('', null),
  tags: Joi.array().items(Joi.string().trim()),
  status: Joi.string().valid('draft', 'published', 'archived'),
  metaTitle: Joi.string().trim().max(70).allow('', null),
  metaDescription: Joi.string().trim().max(160).allow('', null),
});

exports.updateBlogSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200),
  content: Joi.string().trim().min(20),
  excerpt: Joi.string().trim().max(300).allow('', null),
  coverImage: Joi.string().trim().uri().allow('', null),
  category: Joi.string().trim().allow('', null),
  tags: Joi.array().items(Joi.string().trim()),
  status: Joi.string().valid('draft', 'published', 'archived'),
  metaTitle: Joi.string().trim().max(70).allow('', null),
  metaDescription: Joi.string().trim().max(160).allow('', null),
}).min(1); // at least one field required for update
