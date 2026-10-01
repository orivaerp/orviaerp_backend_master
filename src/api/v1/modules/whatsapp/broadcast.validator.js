const Joi = require('joi');

// WhatsApp wa_id format: digits only, no leading "+".
const phonePattern = /^[0-9]{7,15}$/;

exports.createBroadcastSchema = Joi.object({
  templateName: Joi.string().trim().min(1).required(),
  templateLanguage: Joi.string().trim().min(1).required(),
  bodyParams: Joi.array().items(Joi.string().trim().allow('')).default([]),
  recipients: Joi.array()
    .items(
      Joi.string()
        .trim()
        .pattern(phonePattern)
        .message('Each recipient must be digits only (no "+" or spaces), e.g. 919876543210')
    )
    .min(1)
    .max(1000)
    .unique()
    .required(),
});
