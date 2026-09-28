const mongoose = require('mongoose');
const { Schema } = mongoose;

// Mirrors the service dropdown on the public "Project brief" contact form.
const CONTACT_SERVICES = [
  'custom-erp',
  'school-college-erp',
  'hospital-management',
  'inventory-gst-billing',
  'crm-lead-management',
  'website-design-development',
  'ecommerce-development',
  'mobile-app-development',
  'web-application-development',
  'ui-ux-design',
  'seo-services',
  'local-seo-google-business',
  'google-ads-ppc',
  'social-media-marketing',
  'not-sure',
];

const CONTACT_BUDGETS = ['under-25k', '25k-75k', '75k-2l', '2l-5l', 'above-5l', 'not-sure'];

const CONTACT_TIMELINES = ['asap', 'within-1-month', '1-3-months', 'just-researching'];

// Triage pipeline for the sales team reviewing incoming briefs.
const CONTACT_STATUSES = ['new', 'contacted', 'in-progress', 'converted', 'lost', 'closed'];

const contactSubmissionSchema = new Schema(
  {
    // ---------- FROM THE PUBLIC FORM ----------
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    companyWebsite: { type: String, trim: true },
    service: { type: String, enum: CONTACT_SERVICES, required: true },
    budget: { type: String, enum: CONTACT_BUDGETS },
    timeline: { type: String, enum: CONTACT_TIMELINES },
    message: { type: String, required: true, trim: true }, // "Project brief"

    // ---------- ADMIN / INTERNAL ----------
    status: { type: String, enum: CONTACT_STATUSES, default: 'new', index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: [
      {
        text: { type: String, trim: true, required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // ---------- SUBMISSION METADATA ----------
    source: { type: String, trim: true, default: 'website-contact-form' },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contactSubmissionSchema.index({ createdAt: -1 });

const ContactSubmission = mongoose.model('ContactSubmission', contactSubmissionSchema);

ContactSubmission.SERVICES = CONTACT_SERVICES;
ContactSubmission.BUDGETS = CONTACT_BUDGETS;
ContactSubmission.TIMELINES = CONTACT_TIMELINES;
ContactSubmission.STATUSES = CONTACT_STATUSES;

module.exports = ContactSubmission;
