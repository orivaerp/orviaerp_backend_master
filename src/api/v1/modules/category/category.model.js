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

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, index: true },

    // ---------- TREE ----------
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null, // null = main category
      index: true,
    },
    ancestors: [
      {
        _id: { type: Schema.Types.ObjectId, ref: "Category" },
        name: String,
        slug: String,
      },
    ],
    level: { type: Number, default: 0 }, // 0 = main, 1 = sub, 2 = sub-sub
    path: { type: String, index: true }, // e.g. website/portfolio-website

    // ---------- UI ----------
    description: String,
    icon: String,
    image: String,

    // ---------- SEO ----------
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
    },

    // ---------- STATUS ----------
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ---------- INDEXES ----------
categorySchema.index({ "ancestors._id": 1 });
categorySchema.index({ parent: 1, order: 1 });

// ---------- PRE-SAVE: slug, level, ancestors, path ----------
// Async middleware signals completion via the returned promise, not a next()
// callback — Mongoose won't supply a real `next` here, so we throw/return instead.
categorySchema.pre("save", async function () {
  // 1. Slug auto-generate
  if (this.isModified("name") && !this.slug) {
    this.slug = slugify(this.name);
  }

  // 2. Ancestors / level / path (naya ho ya parent change hua ho)
  if (this.isNew || this.isModified("parent") || this.isModified("slug")) {
    if (this.parent) {
      const parentDoc = await this.constructor.findById(this.parent);
      if (!parentDoc) throw new Error("Parent category nahi mili");

      // Category ko apna hi child banne se roko
      if (
        String(parentDoc._id) === String(this._id) ||
        parentDoc.ancestors.some((a) => String(a._id) === String(this._id))
      ) {
        throw new Error("Category apni hi subcategory nahi ban sakti");
      }

      this.ancestors = [
        ...parentDoc.ancestors,
        { _id: parentDoc._id, name: parentDoc.name, slug: parentDoc.slug },
      ];
      this.level = parentDoc.level + 1;
      this.path = `${parentDoc.path}/${this.slug}`;
    } else {
      this.ancestors = [];
      this.level = 0;
      this.path = this.slug;
    }
  }
});

// ---------- POST-SAVE: parent/slug change par saare descendants update ----------
categorySchema.post("save", async function () {
  if (!this._descendantsNeedUpdate) return;

  const children = await this.constructor.find({ parent: this._id });
  for (const child of children) {
    child.markModified("parent"); // hook dobara chalane ke liye
    await child.save();
  }
});

categorySchema.pre("save", function () {
  if (!this.isNew && (this.isModified("parent") || this.isModified("slug"))) {
    this._descendantsNeedUpdate = true;
  }
});

// ---------- STATICS ----------

// Poora tree nested format mein (frontend menu ke liye)
categorySchema.statics.getTree = async function () {
  const all = await this.find({ isActive: true, isDeleted: false })
    .sort({ order: 1, name: 1 })
    .lean();

  const map = {};
  all.forEach((c) => (map[c._id] = { ...c, children: [] }));

  const roots = [];
  all.forEach((c) => {
    if (c.parent && map[c.parent]) map[c.parent].children.push(map[c._id]);
    else roots.push(map[c._id]);
  });
  return roots;
};

// Kisi category ke saare descendants (children, grandchildren...)
categorySchema.statics.getDescendants = function (categoryId) {
  return this.find({ "ancestors._id": categoryId, isDeleted: false });
};

// Soft delete: category + uske saare descendants
categorySchema.statics.softDelete = async function (categoryId) {
  await this.updateMany(
    { $or: [{ _id: categoryId }, { "ancestors._id": categoryId }] },
    { isDeleted: true, isActive: false }
  );
};

module.exports = mongoose.model("Category", categorySchema);
