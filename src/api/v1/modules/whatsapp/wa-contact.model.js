const mongoose = require('mongoose');

const waContactSchema = new mongoose.Schema(
  {
    waId: {
      // WhatsApp's own identifier for the customer - effectively their phone
      // number in international format without the leading "+".
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      // The profile name Meta sends with each message - not verified/unique,
      // just what the customer has set as their WhatsApp display name.
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WaContact', waContactSchema);
