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
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: [
      {
        text: { type: String, trim: true, required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
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

module.exports = Enquiry;
