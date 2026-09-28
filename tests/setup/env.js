process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.USE_PROXY = 'false';

// Dummy S3 config so route files that build a multer-s3 uploader at require
// time (multer-s3 validates its bucket name eagerly, at construction) don't
// crash the whole app on import. No test actually uploads to S3 with these.
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key-id';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key';
process.env.AWS_S3_BUCKET_PUBLIC = 'test-public-bucket';
process.env.AWS_S3_BUCKET_PRIVATE = 'test-private-bucket';

// Pin the in-memory MongoDB server version for reproducible, cached test runs.
// (Separately, package.json pins the `mongodb` driver to 7.5.0 via "overrides"
// to work around a driver 7.6.0 regression that breaks the handshake under Jest.)
process.env.MONGOMS_VERSION = '7.0.14';
