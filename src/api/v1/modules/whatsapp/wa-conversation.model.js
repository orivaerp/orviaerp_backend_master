const mongoose = require('mongoose');

const waConversationSchema = new mongoose.Schema(
  {
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaContact',
      required: true,
      unique: true, // one thread per WhatsApp contact
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['open', 'pending', 'closed'],
      default: 'open',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessagePreview: {
      type: String,
      trim: true,
    },
    lastInboundAt: {
      // Meta only allows free-form replies within 24h of the customer's last
      // message - this timestamp is what that window is measured from.
      type: Date,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WaConversation', waConversationSchema);
