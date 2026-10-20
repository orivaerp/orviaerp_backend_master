const mongoose = require('mongoose');

// A file uploaded to Meta's media store so it can be used as a template header.
// Meta keeps uploaded media for 30 days, after which `mediaId` stops working.
const waMediaSchema = new mongoose.Schema(
  {
    mediaId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['image', 'video', 'document'], required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WaMedia', waMediaSchema);
