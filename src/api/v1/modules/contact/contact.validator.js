const Joi = require('joi');
const ContactSubmission = require('./contact.model');

const objectId = Joi.string().trim().hex().length(24);

// Matches the public "Project brief" form. Only name/email/phone/service/message
// are required there — everything else (company, website, budget, timeline) is optional.
exports.createContactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().required(),
  phone: Joi.string().trim().min(6).max(20).required(),
  company: Joi.string().trim().max(150).allow('', null),
  companyWebsite: Joi.string().trim().uri().max(300).allow('', null),
  service: Joi.string().valid(...ContactSubmission.SERVICES).required(),
  budget: Joi.string().valid(...ContactSubmission.BUDGETS).allow('', null),
  timeline: Joi.string().valid(...ContactSubmission.TIMELINES).allow('', null),
  message: Joi.string().trim().min(10).max(4000).required(),
});

exports.updateContactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  email: Joi.string().trim().email(),
  phone: Joi.string().trim().min(6).max(20),
  company: Joi.string().trim().max(150).allow('', null),
  companyWebsite: Joi.string().trim().uri().max(300).allow('', null),
  service: Joi.string().valid(...ContactSubmission.SERVICES),
  budget: Joi.string().valid(...ContactSubmission.BUDGETS).allow('', null),
  timeline: Joi.string().valid(...ContactSubmission.TIMELINES).allow('', null),
  message: Joi.string().trim().min(10).max(4000),
  status: Joi.string().valid(...ContactSubmission.STATUSES),
  assignedTo: objectId.allow(null, ''),
}).min(1);

exports.addNoteSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required(),
});
