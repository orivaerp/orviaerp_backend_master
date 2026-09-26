const Joi = require('joi');

const objectId = Joi.string().trim().hex().length(24);

const planSchema = Joi.object({
  name: Joi.string().trim().required(),
  price: Joi.number().required(),
  features: Joi.array().items(Joi.string().trim()),
  deliveryDays: Joi.number(),
  revisions: Joi.number(),
});

const faqSchema = Joi.object({
  question: Joi.string().trim().required(),
  answer: Joi.string().trim().required(),
});

const seoSchema = Joi.object({
  metaTitle: Joi.string().trim().max(70).allow('', null),
  metaDescription: Joi.string().trim().max(160).allow('', null),
  keywords: Joi.array().items(Joi.string().trim()),
  ogImage: Joi.string().trim().uri().allow('', null),
});

const baseFields = {
  name: Joi.string().trim().min(2).max(200),
  // Optional — auto-generated from the category on create when left blank.
  code: Joi.string().trim().max(30).allow('', null),
  shortDescription: Joi.string().trim().max(300).allow('', null),
  description: Joi.string().trim().allow('', null),
  category: objectId,
  subCategory: objectId.allow(null, ''),
  subSubCategory: objectId.allow(null, ''),
  tags: Joi.array().items(Joi.string().trim()),
  pricingType: Joi.string().valid('fixed', 'starting-from', 'custom-quote', 'monthly'),
  price: Joi.number().allow(null),
  currency: Joi.string().trim(),
  discount: Joi.number().min(0).max(100),
  plans: Joi.array().items(planSchema),
  features: Joi.array().items(Joi.string().trim()),
  deliverables: Joi.array().items(Joi.string().trim()),
  faqs: Joi.array().items(faqSchema),
  attributes: Joi.object().unknown(true),
  thumbnail: Joi.string().trim().uri().allow('', null),
  gallery: Joi.array().items(Joi.string().trim().uri()),
  demoUrl: Joi.string().trim().uri().allow('', null),
  seo: seoSchema,
  status: Joi.string().valid('draft', 'published', 'archived'),
  isFeatured: Joi.boolean(),
  order: Joi.number(),
};

exports.createProductSchema = Joi.object({
  ...baseFields,
  name: baseFields.name.required(),
  category: baseFields.category.required(),
});

exports.updateProductSchema = Joi.object(baseFields).min(1);
