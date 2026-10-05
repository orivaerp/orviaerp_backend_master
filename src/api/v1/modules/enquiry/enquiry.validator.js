const Joi = require('joi');
const Enquiry = require('./enquiry.model');

const objectId = Joi.string().trim().hex().length(24);

const leadDetailFields = {
  category: Joi.string().valid(...Enquiry.CATEGORIES).allow('', null),
  subCategory: Joi.string().trim().max(120).allow('', null),
  firmName: Joi.string().trim().max(150).allow('', null),
  website: Joi.string().trim().uri().max(300).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  address: Joi.string().trim().max(300).allow('', null),
  state: Joi.string().trim().max(100).allow('', null),
};

const contactFields = {
  name: Joi.string().trim().min(2).max(120),
  email: Joi.string().trim().email().allow('', null),
  phone: Joi.string().trim().min(6).max(20),
  message: Joi.string().trim().min(5).max(2000).allow('', null),
  product: objectId.allow(null, ''),
  subject: Joi.string().trim().max(200).allow('', null),
};

exports.createEnquirySchema = Joi.object({
  ...contactFields,
  name: contactFields.name.required(),
  phone: contactFields.phone.required(),
  source: Joi.string().valid(...Enquiry.SOURCES),
  // Only relevant when staff manually add a lead that's already past "new".
  status: Joi.string().valid(...Enquiry.STATUSES),
  // Honoured only when an admin is creating the lead.
  assignedTo: objectId.allow(null, ''),
  ...leadDetailFields,
});

exports.updateEnquirySchema = Joi.object({
  ...contactFields,
  status: Joi.string().valid(...Enquiry.STATUSES),
  source: Joi.string().valid(...Enquiry.SOURCES),
  assignedTo: objectId.allow(null, ''),
  ...leadDetailFields,
}).min(1);

exports.addNoteSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required(),
  // Optional: also schedule the lead's next follow-up.
  followUpAt: Joi.date().iso().allow(null, ''),
});

// Admin bulk assignment: many leads -> one person (or null to unassign them all).
exports.bulkAssignSchema = Joi.object({
  ids: Joi.array().items(objectId).min(1).max(500).unique().required(),
  assignedTo: objectId.allow(null, '').required(),
});

exports.completeFollowUpSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).allow('', null),
});
