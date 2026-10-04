const Joi = require('joi');

// WhatsApp wa_id format: digits only, no leading "+".
const phonePattern = /^[0-9]{7,15}$/;

exports.createBroadcastSchema = Joi.object({
  templateName: Joi.string().trim().min(1).required(),
  templateLanguage: Joi.string().trim().min(1).required(),
  // Meta rejects empty text parameters, so fail fast here instead of failing every recipient.
  bodyParams: Joi.array()
    .items(Joi.string().trim().min(1).message('Template values cannot be empty'))
    .default([]),
  headerMedia: Joi.object({
    type: Joi.string().valid('image', 'video', 'document').required(),
    id: Joi.string().trim(),
    link: Joi.string().trim().uri(),
  })
    .or('id', 'link')
    .optional(),
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
