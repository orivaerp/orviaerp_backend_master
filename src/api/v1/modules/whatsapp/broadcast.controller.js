const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const broadcastService = require('./broadcast.service');

// @desc    Start a bulk template-message broadcast to 1-1000 recipients
// @route   POST /api/v1/whatsapp/broadcasts
exports.createBroadcast = catchAsync(async (req, res) => {
  const { templateName, templateLanguage, bodyParams, recipients } = req.body;

  const broadcast = await broadcastService.createBroadcast({
    templateName,
    templateLanguage,
    bodyParams,
    recipients,
    createdBy: req.user.id,
  });

  // Fire-and-forget: sending up to 1000 messages can take minutes, so the
  // caller gets the broadcast id immediately and tracks progress via
  // GET /:id or the 'broadcast_progress'/'broadcast_completed' socket events.
  broadcastService.processBroadcast(broadcast._id, req.user.id).catch((err) => {
    console.error('[whatsapp broadcast] processing crashed:', err);
  });

  return success(res, {
    statusCode: 202,
    message: `Broadcast started for ${recipients.length} recipient(s)`,
    data: broadcast,
  });
});

// @desc    List past broadcasts
// @route   GET /api/v1/whatsapp/broadcasts
exports.getAllBroadcasts = catchAsync(async (req, res) => {
  const broadcasts = await broadcastService.findBroadcasts();
  return success(res, { message: 'Broadcasts fetched successfully', data: broadcasts });
});

// @desc    Get one broadcast's progress/results
// @route   GET /api/v1/whatsapp/broadcasts/:id
exports.getBroadcastById = catchAsync(async (req, res) => {
  const broadcast = await broadcastService.findBroadcastById(req.params.id);
  if (!broadcast) {
    return error(res, { statusCode: 404, message: 'Broadcast not found' });
  }
  return success(res, { message: 'Broadcast fetched successfully', data: broadcast });
});
