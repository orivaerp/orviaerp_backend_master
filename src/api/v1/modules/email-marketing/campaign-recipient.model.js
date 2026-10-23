const mongoose = require('mongoose');

const RECIPIENT_STATUSES = ['queued', 'sent', 'failed', 'skipped', 'bounced', 'complained'];

// One row per person per campaign. `token` is the secret in that person's open-pixel, click
// and unsubscribe links, so those public URLs never need a login and can't be guessed.
const campaignRecipientSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['subscribers', 'enquiries', 'contacts'], required: true },
    token: { type: String, required: true, unique: true },
    status: { type: String, enum: RECIPIENT_STATUSES, default: 'queued' },
    // SES's own id for the message; bounce/complaint notices from SNS refer to it.
    sesMessageId: { type: String },
    error: String,
    sentAt: Date,
    deliveredAt: Date,
    openedAt: Date,
    openCount: { type: Number, default: 0 },
    clickedAt: Date,
    clickCount: { type: Number, default: 0 },
    unsubscribedAt: Date,
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaign: 1, status: 1 });
campaignRecipientSchema.index({ campaign: 1, email: 1 }, { unique: true });
campaignRecipientSchema.index({ sesMessageId: 1 }, { sparse: true });

const CampaignRecipient = mongoose.model('EmailCampaignRecipient', campaignRecipientSchema);
CampaignRecipient.STATUSES = RECIPIENT_STATUSES;

module.exports = CampaignRecipient;
