const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, buckets } = require('../config/aws');

function resolveBucketName(bucket) {
  // Accept either a shorthand ('public'/'private') or a literal bucket name.
  return buckets[bucket] || bucket;
}

/**
 * Deletes a single object from S3. Never throws — a failed cleanup (object
 * already gone, transient AWS error, etc.) should not block whatever
 * primary operation triggered it (saving a new cover image, deleting a post).
 * Returns true if the delete call succeeded, false otherwise.
 */
exports.deleteFromS3 = async ({ key, bucket = 'public' }) => {
  if (!key) return false;

  const bucketName = resolveBucketName(bucket);
  if (!bucketName) {
    console.warn(`[file-upload.service] No bucket resolved for "${bucket}" — skipping delete of "${key}".`);
    return false;
  }

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch (err) {
    console.error(`[file-upload.service] Failed to delete "${key}" from "${bucketName}":`, err.message);
    return false;
  }
};

/**
 * Builds the { url, key } pair stored on the document from a multer-s3
 * `req.file`, and — if an old file is being replaced — deletes the previous
 * object from S3 first. Used by any "replace this image" endpoint.
 */
exports.replaceFile = async ({ oldKey, file, bucket = 'public' }) => {
  if (oldKey) {
    await exports.deleteFromS3({ key: oldKey, bucket });
  }
  return { url: file.location, key: file.key };
};
