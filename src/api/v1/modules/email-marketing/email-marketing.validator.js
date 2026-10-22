const Joi = require('joi');
const Enquiry = require('../enquiry/enquiry.model');
const Contact = require('../contact/contact.model');
const Subscriber = require('./subscriber.model');

// example.com style addresses are fine; we only need "looks like an email".
const email = () => Joi.string().trim().lowercase().email({ tlds: { allow: false } });
const tags = () => Joi.array().items(Joi.string().trim().lowercase().max(40)).max(20).default([]);

exports.createSubscriberSchema = Joi.object({
  email: email().required(),
  name: Joi.string().trim().allow('').max(120).default(''),
  tags: tags(),
});

exports.updateSubscriberSchema = Joi.object({
  name: Joi.string().trim().allow('').max(120),
  tags: tags(),
  status: Joi.string().valid(...Subscriber.STATUSES),
}).min(1);

exports.importSubscribersSchema = Joi.object({
  csv: Joi.string().min(1).required(),
});

exports.templateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  subject: Joi.string().trim().min(1).max(200).required(),
  html: Joi.string().min(1).required(),
});

const audience = Joi.object({
  subscribers: Joi.object({
    enabled: Joi.boolean().default(false),
    tags: tags(),
  }).default(),
  enquiries: Joi.object({
    enabled: Joi.boolean().default(false),
    statuses: Joi.array().items(Joi.string().valid(...Enquiry.STATUSES)).default([]),
  }).default(),
  contacts: Joi.object({
    enabled: Joi.boolean().default(false),
    statuses: Joi.array().items(Joi.string().valid(...Contact.STATUSES)).default([]),
  }).default(),
}).default();

exports.createCampaignSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  subject: Joi.string().trim().min(1).max(200).required(),
  fromName: Joi.string().trim().allow('').max(120),
  fromEmail: email().allow(''),
  html: Joi.string().min(1).required(),
  audience,
});

exports.updateCampaignSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  subject: Joi.string().trim().min(1).max(200),
  fromName: Joi.string().trim().allow('').max(120),
  fromEmail: email().allow(''),
  html: Joi.string().min(1),
  audience,
}).min(1);

exports.testSendSchema = Joi.object({ to: email().required() });

exports.audiencePreviewSchema = Joi.object({ audience });
