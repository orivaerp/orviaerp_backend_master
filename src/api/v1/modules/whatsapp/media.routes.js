const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getAllMedia,
  uploadMedia,
  getMediaFile,
  deleteMedia,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} = require('./media.controller');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

// Kept in memory: the file is only passed on to Meta, which is where it lives.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Only JPG/PNG images, MP4/3GP videos and PDF documents are supported');
    err.statusCode = 400;
    cb(err);
  },
});

router.use(isAuthenticated, restrictTo('admin'));

router.get('/', getAllMedia);
router.post('/', upload.single('file'), uploadMedia);
router.get('/:id/file', getMediaFile);
router.delete('/:id', deleteMedia);

module.exports = router;
