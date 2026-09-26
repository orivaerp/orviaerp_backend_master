const mongoose = require("mongoose");
const { Schema } = mongoose;

const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

// "Website" -> "WEB", "Digital Marketing" -> "DM" — short, readable prefix
// for product codes, derived from the category name.
function derivePrefix(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  let prefix;
  if (words.length > 1) {
    prefix = words
      .slice(0, 4)
      .map((w) => w[0])
      .join("");
  } else {
    prefix = (name || "").replace(/[^a-zA-Z]/g, "").slice(0, 3);
  }
  prefix = prefix.toUpperCase();
  return prefix.length >= 2 ? prefix : "PRD";
}

const planSchema = new Schema(
  {
    name: { type: String, required: true }, // Basic / Standard / Premium
    price: { type: Number, required: true },
    features: [String],
    deliveryDays: Number,
    revisions: Number,
  },
  { _id: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    // Auto-generated on create (see Product.generateCode) unless supplied explicitly.
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    shortDescription: String,
    description: String,

    // ---------- CATEGORY (explicit levels) ----------
    category: {
      // Main: Website, ERP, SEO, Digital Marketing, Digital Branding
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    subCategory: {
      // e.g. Portfolio Website, HRM, On-page SEO
      type: Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },
    subSubCategory: {
      // optional, e.g. Personal Portfolio
      type: Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },
    tags: [String],

    // ---------- PRICING ----------
    pricingType: {
      type: String,
      enum: ["fixed", "starting-from", "custom-quote", "monthly"],
      default: "starting-from",
    },
    price: Number,
    currency: { type: String, default: "INR" },
    discount: { type: Number, default: 0 },
    plans: [planSchema],

    // ---------- CONTENT ----------
    features: [String],
    deliverables: [String],
    faqs: [{ question: String, answer: String }],
    attributes: { type: Map, of: Schema.Types.Mixed }, // category-specific data

    // ---------- MEDIA ----------
    thumbnail: String,
    gallery: [String],
    demoUrl: String,

    // ---------- SEO ----------
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
      ogImage: String,
    },

    // ---------- STATUS ----------
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    isFeatured: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ---------- SLUG ----------
productSchema.pre("validate", function () {
  if (this.isModified("name") && !this.slug) {
    this.slug = slugify(this.name);
  }
});

// ---------- VALIDATION: subCategory must belong to category ----------
// Async middleware signals completion via the returned promise, not a next()
// callback — Mongoose won't supply a real `next` here, so we throw instead.
productSchema.pre("validate", async function () {
  const Category = mongoose.model("Category");

  if (this.subCategory) {
    const sub = await Category.findById(this.subCategory);
    if (!sub || String(sub.parent) !== String(this.category)) {
      throw new Error("subCategory is category ka child nahi hai");
    }
  }
  if (this.subSubCategory) {
    const subSub = await Category.findById(this.subSubCategory);
    if (!subSub || String(subSub.parent) !== String(this.subCategory)) {
      throw new Error("subSubCategory is subCategory ka child nahi hai");
    }
  }
});

// ---------- INDEXES ----------
productSchema.index({ category: 1, subCategory: 1, status: 1 });
productSchema.index({ name: "text", tags: "text" });

// ---------- STATICS ----------

// Generates a unique, human-readable product code like "WEB-0001", prefixed
// from the product's category. Retries a few times against the unique index
// before falling back to a timestamp-based suffix.
productSchema.statics.generateCode = async function (categoryId) {
  const Category = mongoose.model("Category");
  const category = categoryId ? await Category.findById(categoryId) : null;
  const prefix = derivePrefix(category ? category.name : "");

  const baseCount = await this.countDocuments({ code: new RegExp(`^${prefix}-\\d+$`) });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = String(baseCount + 1 + attempt).padStart(4, "0");
    const candidate = `${prefix}-${seq}`;
    const exists = await this.exists({ code: candidate });
    if (!exists) return candidate;
  }
  // Astronomically unlikely fallback if the sequence keeps colliding.
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
};

module.exports = mongoose.model("Product", productSchema);
