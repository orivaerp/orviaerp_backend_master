const mongoose = require('mongoose');

const CAMPAIGN_STATUSES = ['draft', 'sending', 'completed', 'failed'];

const audienceSchema = new mongoose.Schema(
  {
    subscribers: {
      enabled: { type: Boolean, default: false },
      tags: [{ type: String, trim: true, lowercase: true }],
    },
    enquiries: {
      enabled: { type: Boolean, default: false },
      statuses: [String],
    },
    contacts: {
      enabled: { type: Boolean, default: false },
      statuses: [String],
    },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    fromName: { type: String, trim: true },
    fromEmail: { type: String, trim: true, lowercase: true },
    html: { type: String, required: true },
    audience: { type: audienceSchema, default: () => ({}) },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },

    // Where tracking / unsubscribe links point; fixed when sending starts.
    baseUrl: String,

    // Progress and results. Opens/clicks are unique people, not raw hits.
    totalCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    bounceCount: { type: Number, default: 0 },
    complaintCount: { type: Number, default: 0 },
    unsubscribeCount: { type: Number, default: 0 },

    startedAt: Date,
    completedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const Campaign = mongoose.model('EmailCampaign', campaignSchema);
Campaign.STATUSES = CAMPAIGN_STATUSES;

module.exports = Campaign;
