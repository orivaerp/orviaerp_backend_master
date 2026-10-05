const mongoose = require('mongoose');
const { Schema } = mongoose;

// Where the lead came from. Kept as a fixed enum (rather than free text) so
// filtering/stats/CSV export stay consistent.
const ENQUIRY_SOURCES = [
  'walkin',
  'website',
  'campaign',
  'websearch',
  'direct',
  'reference',
  'social-media',
  'email',
  'phone-call',
  'advertisement',
  'event',
  'other',
];

// Lead pipeline stage.
const ENQUIRY_STATUSES = ['new', 'contacted', 'in-progress', 'converted', 'lost', 'wrong', 'closed'];

// Business domain the lead belongs to (independent of the Product/Category
// catalog tree). subCategory is free text — its valid values differ per
// domain and the frontend only offers suggestions, not a hard enum.
const ENQUIRY_CATEGORIES = ['health', 'education', 'transport', 'retail', 'portfolio'];

const ENQUIRY_ACTIVITY_TYPES = ['created', 'assigned', 'status_changed', 'followup_done'];

const enquirySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, trim: true },

    // Optional link to the product/service this enquiry is about.
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    subject: { type: String, trim: true },
    source: {
      type: String,
      enum: ENQUIRY_SOURCES,
      default: 'website',
      index: true,
    },

    category: {
      type: String,
      enum: ENQUIRY_CATEGORIES,
      index: true,
    },
    subCategory: { type: String, trim: true },
    firmName: { type: String, trim: true },
    website: { type: String, trim: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    state: { type: String, trim: true },

    status: {
      type: String,
      enum: ENQUIRY_STATUSES,
      default: 'new',
      index: true,
    },
    // Only an admin can set this. Non-admin staff can see (and work) only the
    // leads assigned to them.
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // The one pending follow-up, if any (set by adding a remark with a follow-up
    // date, cleared when it's marked done). Drives the "follow-ups due" views.
    nextFollowUpAt: { type: Date, index: true },
    // Staff member who added the lead from the admin panel (or imported it).
    // Left empty for public website-form submissions.
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: [
      {
        text: { type: String, trim: true, required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        // Set when the remark also schedules a follow-up.
        followUpAt: { type: Date },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // System-recorded events (remarks live in `notes`; the UI merges the two into
    // one timeline). Append-only.
    activities: [
      new Schema(
        {
          type: { type: String, enum: ENQUIRY_ACTIVITY_TYPES, required: true },
          actor: { type: Schema.Types.ObjectId, ref: 'User' }, // empty = website form / system
          at: { type: Date, default: Date.now },
          statusFrom: String,
          statusTo: String,
          assignedFrom: { type: Schema.Types.ObjectId, ref: 'User' },
          assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
          followUpAt: Date,
          text: { type: String, trim: true },
        },
        { _id: false }
      ),
    ],

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

enquirySchema.index({ createdAt: -1 });

const Enquiry = mongoose.model('Enquiry', enquirySchema);

// Exposed so the validator/controller build off the same source of truth
// instead of duplicating the list.
Enquiry.SOURCES = ENQUIRY_SOURCES;
Enquiry.STATUSES = ENQUIRY_STATUSES;
Enquiry.CATEGORIES = ENQUIRY_CATEGORIES;
Enquiry.ACTIVITY_TYPES = ENQUIRY_ACTIVITY_TYPES;

module.exports = Enquiry;
