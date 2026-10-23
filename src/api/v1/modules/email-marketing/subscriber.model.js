const mongoose = require('mongoose');

// "subscribed" people can be mailed. Everything else is a suppression: the address is
// skipped by every campaign, whatever list it came from (subscribers, leads, contact form).
const SUBSCRIBER_STATUSES = ['subscribed', 'unsubscribed', 'bounced', 'complained', 'blocked'];
const SUBSCRIBER_SOURCES = ['manual', 'csv', 'unsubscribe', 'bounce'];
// How an address ended up blocked: the unsubscribe page, the mail app's one-click button,
// a bounce / complaint reported by SES, or an admin blocking it by hand.
const BLOCK_SOURCES = ['link', 'one-click', 'ses', 'manual'];

const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, trim: true, default: '' },
    tags: [{ type: String, trim: true, lowercase: true }],
    status: { type: String, enum: SUBSCRIBER_STATUSES, default: 'subscribed', index: true },
    source: { type: String, enum: SUBSCRIBER_SOURCES, default: 'manual' },
    statusChangedAt: { type: Date },
    blockSource: { type: String, enum: BLOCK_SOURCES },
    note: { type: String, trim: true, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const Subscriber = mongoose.model('Subscriber', subscriberSchema);
Subscriber.STATUSES = SUBSCRIBER_STATUSES;

module.exports = Subscriber;
