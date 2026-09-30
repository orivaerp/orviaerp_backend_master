const { DeleteObjectCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
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

/**
 * Uploads a raw buffer we fetched ourselves (not a multer file) — e.g. media
 * downloaded from WhatsApp's Cloud API. Returns just the key; callers that
 * need a viewable URL should use getSignedGetUrl (for the private bucket) or
 * build the public URL themselves.
 */
exports.uploadBuffer = async ({ buffer, mimeType, folder = 'misc', filename, bucket = 'private' }) => {
  const bucketName = resolveBucketName(bucket);
  const safeName = (filename || 'file').replace(/\s+/g, '-');
  const key = `${folder}/${Date.now()}-${safeName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return { key, mimeType };
};

/**
 * A time-limited URL for an object in the private bucket (WhatsApp media
 * isn't meant to be public). Defaults to 1 hour.
 */
exports.getSignedGetUrl = async ({ key, bucket = 'private', expiresInSeconds = 3600 }) => {
  const bucketName = resolveBucketName(bucket);
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};
