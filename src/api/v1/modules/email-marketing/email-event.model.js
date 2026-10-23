const mongoose = require('mongoose');

// What Amazon SES reported back about a message (via SNS): delivered, bounced or complained.
// Transient bounces (full mailbox, server busy) are kept here too, even though they don't
// block the address, so the Deliverability page shows everything SES said.
const emailEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['delivered', 'bounced', 'complained'], required: true },
    // Permanent | Transient | Undetermined - only for bounces
    bounceType: String,
    bounceSubType: String,
    email: { type: String, required: true, lowercase: true, trim: true },
    sesMessageId: { type: String, required: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign' },
    detail: String,
    occurredAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// SNS can deliver the same notice twice; one row per message, address and kind.
emailEventSchema.index({ sesMessageId: 1, email: 1, type: 1 }, { unique: true });
emailEventSchema.index({ occurredAt: -1 });
emailEventSchema.index({ type: 1, occurredAt: -1 });

module.exports = mongoose.model('EmailEvent', emailEventSchema);
