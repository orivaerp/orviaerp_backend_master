const mongoose = require('mongoose');

const waMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaConversation',
      required: true,
    },
    waMessageId: {
      // Meta's message id - used to de-duplicate webhook deliveries (Meta
      // can and does redeliver) and to match later status updates back to
      // a message.
      type: String,
      unique: true,
      sparse: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'document', 'audio', 'video', 'template', 'unknown'],
      default: 'text',
    },
    text: {
      type: String,
    },
    media: {
      url: String,
      key: String, // our own S3 copy of inbound media (Meta's CDN links expire)
      mimeType: String,
      filename: String,
    },
    sentBy: {
      // set only for outbound messages - which agent sent it
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    timestamp: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

waMessageSchema.index({ conversation: 1, timestamp: 1 });

module.exports = mongoose.model('WaMessage', waMessageSchema);
