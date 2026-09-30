const catchAsync = require('../../../../common/utils/catchAsync');

// @desc    Meta calls this once, with a GET request, to verify the webhook
//          callback URL when you click "Verify and save" in the app dashboard.
// @route   GET /api/v1/whatsup
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

// @desc    Receives incoming WhatsApp messages and status updates.
//          Meta expects a fast 200 ack, then retries with backoff if it
//          doesn't get one - so acknowledge first, process after.
// @route   POST /api/v1/whatsup
exports.receiveWebhook = catchAsync(async (req, res) => {
  res.sendStatus(200);

  // TODO: hand off req.body to a service once there's real message handling
  // (storing conversations, replying via the Graph API, etc.) to build.
  console.log('[whatsapp webhook]', JSON.stringify(req.body));
});
