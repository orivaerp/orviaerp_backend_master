const Joi = require('joi');

const MIN_CONTENT_TEXT = 10;

// What a reader would see: tags and &nbsp; removed, whitespace collapsed.
const visibleText = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Post bodies are rich-text HTML, so the length that matters is the *text*, not the markup:
// "<p>Hello world</p>" is 18 characters of HTML but a perfectly good (11-character) post, and
// Quill's empty editor "<p><br></p>" is 11 characters of HTML with no text at all. A post that
// is only an image is fine.
const content = Joi.string()
  .trim()
  .custom((value, helpers) => {
    if (/<img\b/i.test(value)) return value;
    if (visibleText(value).length < MIN_CONTENT_TEXT) {
      return helpers.message(`Post content must have at least ${MIN_CONTENT_TEXT} characters of text`);
    }
    return value;
  });

exports.createBlogSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  content: content.required(),
  excerpt: Joi.string().trim().max(300).allow('', null),
  // coverImage is never set here — it's an { url, key } pair managed exclusively
  // by PUT /:id/cover-image (multer-s3), not a plain string a client can post.
  category: Joi.string().trim().allow('', null),
  tags: Joi.array().items(Joi.string().trim()),
  status: Joi.string().valid('draft', 'published', 'archived'),
  metaTitle: Joi.string().trim().max(70).allow('', null),
  metaDescription: Joi.string().trim().max(160).allow('', null),
});

exports.updateBlogSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200),
  content,
  excerpt: Joi.string().trim().max(300).allow('', null),
  category: Joi.string().trim().allow('', null),
  tags: Joi.array().items(Joi.string().trim()),
  status: Joi.string().valid('draft', 'published', 'archived'),
  metaTitle: Joi.string().trim().max(70).allow('', null),
  metaDescription: Joi.string().trim().max(160).allow('', null),
}).min(1); // at least one field required for update
