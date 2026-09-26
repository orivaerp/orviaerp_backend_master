const Joi = require('joi');

const objectId = Joi.string().trim().hex().length(24);

const seoSchema = Joi.object({
  metaTitle: Joi.string().trim().max(70).allow('', null),
  metaDescription: Joi.string().trim().max(160).allow('', null),
  keywords: Joi.array().items(Joi.string().trim()),
});

exports.createCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  parent: objectId.allow(null, ''),
  description: Joi.string().trim().allow('', null),
  icon: Joi.string().trim().allow('', null),
  image: Joi.string().trim().uri().allow('', null),
  seo: seoSchema,
  order: Joi.number(),
  isActive: Joi.boolean(),
  isFeatured: Joi.boolean(),
});

exports.updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  parent: objectId.allow(null, ''),
  description: Joi.string().trim().allow('', null),
  icon: Joi.string().trim().allow('', null),
  image: Joi.string().trim().uri().allow('', null),
  seo: seoSchema,
  order: Joi.number(),
  isActive: Joi.boolean(),
  isFeatured: Joi.boolean(),
}).min(1);
