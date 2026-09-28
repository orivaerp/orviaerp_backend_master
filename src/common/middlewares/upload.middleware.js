// src/common/middlewares/upload.middleware.js
const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3Client, buckets } = require('../config/aws');

const DEFAULT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/**
 * Factory for a multer-s3 upload middleware.
 *
 * @param {Object} options
 * @param {'public'|'private'} [options.bucket='public']  which bucket to upload to
 * @param {string} [options.folder='misc']                 key prefix inside the bucket
 * @param {number} [options.maxSizeMB=5]                    max file size in MB
 * @param {string[]} [options.allowedTypes]                 allowed mime types
 */
const makeUploader = ({
  bucket = 'public',
  folder = 'misc',
  maxSizeMB = 5,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
} = {}) => {
  const bucketName = buckets[bucket];

  if (!bucketName) {
    // Warn instead of throwing: this factory runs at route-file require time,
    // so throwing here would crash the whole app (and every test suite that
    // transitively requires these routes) just because AWS env vars aren't
    // set yet. The upload will fail with a clear error if actually attempted.
    console.warn(`[upload.middleware] No bucket configured for "${bucket}". Check your env vars.`);
  }

  return multer({
    storage: multerS3({
      s3: s3Client,
      bucket: bucketName,
      // Only set ACL if your bucket has ACLs enabled; many modern buckets
      // are ACL-disabled (Object Ownership: Bucket owner enforced) - remove
      // this line in that case and rely on bucket policy instead.
    //   ...(bucket === 'public' ? { acl: 'public-read' } : {}),
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '-');
        const uniqueKey = `${folder}/${Date.now()}-${safeName}`;
        cb(null, uniqueKey);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
      }
    },
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  });
};

module.exports = makeUploader;

/* ------------------------------------------------------------------ *
 * Usage example (e.g. in blog.routes.js):
 *
 * const makeUploader = require('../../../common/middlewares/upload.middleware');
 * const upload = makeUploader({ bucket: 'public', folder: 'blog-images', maxSizeMB: 3 });
 *
 * router.post('/', upload.single('coverImage'), blogController.create);
 * // req.file.location  -> public URL of the uploaded file
 * // req.file.key       -> S3 object key
 * ------------------------------------------------------------------ */