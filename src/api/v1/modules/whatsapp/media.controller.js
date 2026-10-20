const mongoose = require('mongoose');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const cloudApi = require('./cloud-api.service');
const WaMedia = require('./wa-media.model');

const MB = 1024 * 1024;

// Meta's per-type upload limits (documents can be bigger, but we cap the in-memory buffer lower).
const TYPE_RULES = {
  'image/jpeg': { type: 'image', maxBytes: 5 * MB },
  'image/png': { type: 'image', maxBytes: 5 * MB },
  'video/mp4': { type: 'video', maxBytes: 16 * MB },
  'video/3gpp': { type: 'video', maxBytes: 16 * MB },
  'application/pdf': { type: 'document', maxBytes: 16 * MB },
};

exports.ALLOWED_MIME_TYPES = Object.keys(TYPE_RULES);
exports.MAX_UPLOAD_BYTES = 16 * MB;

// @desc    List uploaded header media, newest first (optionally ?type=image|video|document)
// @route   GET /api/v1/whatsapp/media
exports.getAllMedia = catchAsync(async (req, res) => {
  const filter = ['image', 'video', 'document'].includes(req.query.type)
    ? { type: req.query.type }
    : {};
  const media = await WaMedia.find(filter).sort({ createdAt: -1 }).lean();
  return success(res, { message: 'Media fetched successfully', data: media });
});

// @desc    Upload a file to WhatsApp and remember its media ID
// @route   POST /api/v1/whatsapp/media   (multipart, field "file")
exports.uploadMedia = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) {
    return error(res, { statusCode: 400, message: 'Choose a file to upload' });
  }

  const rule = TYPE_RULES[file.mimetype];
  if (file.size > rule.maxBytes) {
    return error(res, {
      statusCode: 400,
      message: `${rule.type} files can be at most ${rule.maxBytes / MB} MB`,
    });
  }

  const mediaId = await cloudApi.uploadMedia({
    buffer: file.buffer,
    mimeType: file.mimetype,
    filename: file.originalname,
  });

  const media = await WaMedia.create({
    mediaId,
    type: rule.type,
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    createdBy: req.user.id,
  });

  return success(res, { statusCode: 201, message: 'Media uploaded successfully', data: media });
});

// @desc    Stream the file back (for previews); Meta's own URLs need the access token
// @route   GET /api/v1/whatsapp/media/:id/file
exports.getMediaFile = catchAsync(async (req, res) => {
  const media = mongoose.isValidObjectId(req.params.id) ? await WaMedia.findById(req.params.id) : null;
  if (!media) return error(res, { statusCode: 404, message: 'Media not found' });

  const { buffer, mimeType } = await cloudApi.downloadMedia(media.mediaId);
  res.set('Content-Type', mimeType || media.mimeType);
  res.set('Cache-Control', 'private, max-age=3600');
  return res.send(buffer);
});

// @desc    Remove from our list (the copy at Meta simply expires after 30 days)
// @route   DELETE /api/v1/whatsapp/media/:id
exports.deleteMedia = catchAsync(async (req, res) => {
  const media = mongoose.isValidObjectId(req.params.id)
    ? await WaMedia.findByIdAndDelete(req.params.id)
    : null;
  if (!media) return error(res, { statusCode: 404, message: 'Media not found' });
  return success(res, { message: 'Media removed' });
});
