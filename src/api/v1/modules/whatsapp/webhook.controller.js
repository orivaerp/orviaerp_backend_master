const catchAsync = require('../../../../common/utils/catchAsync');
const { uploadBuffer } = require('../../../../common/services/file-upload.service');
const { getIO } = require('../../../../common/config/socket');
const WaContact = require('./wa-contact.model');
const WaConversation = require('./wa-conversation.model');
const WaMessage = require('./wa-message.model');
const cloudApi = require('./cloud-api.service');

const MEDIA_TYPES = ['image', 'document', 'audio', 'video'];

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

  const entries = req.body?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const profileByWaId = Object.fromEntries(
        (value.contacts || []).map((c) => [c.wa_id, c.profile?.name])
      );

      console.log(
        `[whatsapp webhook] received ${value.messages?.length || 0} message(s), ${value.statuses?.length || 0} status update(s)`
      );

      for (const message of value.messages || []) {
        try {
          await handleInboundMessage(message, profileByWaId[message.from]);
        } catch (err) {
          console.error('[whatsapp webhook] failed to process inbound message', err);
        }
      }

      for (const status of value.statuses || []) {
        try {
          await handleStatusUpdate(status);
        } catch (err) {
          console.error('[whatsapp webhook] failed to process status update', err);
        }
      }
    }
  }
});

async function handleInboundMessage(message, profileName) {
  const contact = await WaContact.findOneAndUpdate(
    { waId: message.from },
    { waId: message.from, ...(profileName ? { name: profileName } : {}) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const timestamp = new Date(Number(message.timestamp) * 1000);

  let conversation = await WaConversation.findOne({ contact: contact._id });
  if (!conversation) {
    conversation = await WaConversation.create({ contact: contact._id });
  }

  const { type, text, media } = await extractContent(message);

  let savedMessage;
  try {
    savedMessage = await WaMessage.create({
      conversation: conversation._id,
      waMessageId: message.id,
      direction: 'inbound',
      type,
      text,
      media,
      status: 'delivered',
      timestamp,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Meta redelivered a webhook we've already processed - not an error.
      return;
    }
    throw err;
  }

  conversation.lastMessageAt = timestamp;
  conversation.lastMessagePreview = text ? text.slice(0, 120) : `[${type}]`;
  conversation.lastInboundAt = timestamp;
  conversation.unreadCount += 1;
  if (conversation.status === 'closed') conversation.status = 'open';
  await conversation.save();

  const payload = { conversationId: conversation._id, message: savedMessage };
  getIO().to('inbox:all').emit('new_message', payload);
  if (conversation.assignedTo) {
    getIO().to(`agent:${conversation.assignedTo}`).emit('new_message', payload);
  }
}

async function extractContent(message) {
  if (message.type === 'text') {
    return { type: 'text', text: message.text?.body };
  }

  if (MEDIA_TYPES.includes(message.type)) {
    const mediaPayload = message[message.type];
    try {
      const { buffer, mimeType } = await cloudApi.downloadMedia(mediaPayload.id);
      const { key } = await uploadBuffer({
        buffer,
        mimeType,
        folder: 'whatsapp-media',
        filename: mediaPayload.filename || mediaPayload.id,
        bucket: 'private',
      });
      return {
        type: message.type,
        text: mediaPayload.caption,
        media: { key, mimeType, filename: mediaPayload.filename },
      };
    } catch (err) {
      console.error('[whatsapp webhook] failed to download/store media', err);
      return { type: message.type, text: mediaPayload.caption };
    }
  }

  return { type: 'unknown' };
}

async function handleStatusUpdate(status) {
  const message = await WaMessage.findOneAndUpdate(
    { waMessageId: status.id },
    { status: status.status },
    { returnDocument: 'after' }
  );

  if (!message) {
    // Status update for a message our DB never created - e.g. it was sent
    // directly via the Graph API/Meta's test console instead of through our
    // send endpoints, or it predates this going live. Not an error, but
    // worth a log line so "nothing shows up" is traceable instead of silent.
    console.log(`[whatsapp webhook] status update for unknown waMessageId "${status.id}" - ignored`);
    return;
  }

  getIO().to('inbox:all').emit('message_status_update', {
    conversationId: message.conversation,
    messageId: message._id,
    status: message.status,
  });
}
