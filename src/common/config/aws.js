const { S3Client } = require('@aws-sdk/client-s3');

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn('[aws.js] AWS credentials are not set in env vars.');
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const buckets = {
  private: process.env.AWS_S3_BUCKET_PRIVATE,
  public: process.env.AWS_S3_BUCKET_PUBLIC,
};

module.exports = { s3Client, buckets };