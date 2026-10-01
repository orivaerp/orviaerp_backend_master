const mongoose = require('mongoose');

const recipientResultSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    waMessageId: String,
    error: String,
  },
  { _id: false }
);

const waBroadcastSchema = new mongoose.Schema(
  {
    templateName: { type: String, required: true },
    templateLanguage: { type: String, required: true },
    bodyParams: [String],
    recipients: [recipientResultSchema],
    totalCount: { type: Number, required: true },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      default: 'processing',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WaBroadcast', waBroadcastSchema);
