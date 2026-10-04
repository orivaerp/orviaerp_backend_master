const WaContact = require('./wa-contact.model');
const WaConversation = require('./wa-conversation.model');
const WaMessage = require('./wa-message.model');
const WaBroadcast = require('./wa-broadcast.model');
const cloudApi = require('./cloud-api.service');
const { getIO } = require('../../../../common/config/socket');

const AGENT_FIELDS = 'firstName lastName email';

// Pacing between sends so a 1000-recipient broadcast doesn't burst past the
// Graph API's rate limits. Not configurable via env on purpose - this is a
// safety floor, not a tuning knob.
const SEND_DELAY_MS = 150;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.createBroadcast = async ({
  templateName,
  templateLanguage,
  bodyParams,
  headerMedia,
  recipients,
  createdBy,
}) => {
  return WaBroadcast.create({
    templateName,
    templateLanguage,
    bodyParams,
    headerMedia,
    recipients: recipients.map((waId) => ({ waId, status: 'queued' })),
    totalCount: recipients.length,
    createdBy,
  });
};

exports.findBroadcasts = async () => {
  return WaBroadcast.find().populate('createdBy', AGENT_FIELDS).sort('-createdAt');
};

exports.findBroadcastById = async (id) => {
  return WaBroadcast.findById(id).populate('createdBy', AGENT_FIELDS);
};

// Runs in the background - the controller does not await this. Sends to each
// recipient one at a time, persisting + broadcasting progress as it goes so
// GET /:id (and the 'broadcast_progress' socket event) always reflect
// current state even if the process is interrupted partway through.
exports.processBroadcast = async (broadcastId, sentBy) => {
  const broadcast = await WaBroadcast.findById(broadcastId);
  if (!broadcast) return;

  for (const recipient of broadcast.recipients) {
    try {
      const waMessageId = await cloudApi.sendTemplateMessage(recipient.waId, {
        name: broadcast.templateName,
        language: broadcast.templateLanguage,
        bodyParams: broadcast.bodyParams,
        headerMedia: broadcast.headerMedia?.type ? broadcast.headerMedia : undefined,
      });

      recipient.status = 'sent';
      recipient.waMessageId = waMessageId;
      broadcast.sentCount += 1;

      await recordOutboundMessage({
        waId: recipient.waId,
        waMessageId,
        templateName: broadcast.templateName,
        bodyParams: broadcast.bodyParams,
        sentBy,
      });
    } catch (err) {
      recipient.status = 'failed';
      recipient.error = err.message;
      broadcast.failedCount += 1;
      console.error(`[whatsapp broadcast] failed to send to ${recipient.waId}:`, err.message);
    }

    await broadcast.save();

    getIO().to('inbox:all').emit('broadcast_progress', {
      broadcastId: broadcast._id,
      sentCount: broadcast.sentCount,
      failedCount: broadcast.failedCount,
      totalCount: broadcast.totalCount,
    });

    await sleep(SEND_DELAY_MS);
  }

  broadcast.status = 'completed';
  await broadcast.save();
  getIO().to('inbox:all').emit('broadcast_completed', { broadcastId: broadcast._id });
};

// Mirrors conversation.controller.js's saveOutboundMessage, but the recipient
// may be a brand-new contact with no existing conversation (unlike a reply
// from the inbox, which always has one already).
async function recordOutboundMessage({ waId, waMessageId, templateName, bodyParams, sentBy }) {
  const contact = await WaContact.findOneAndUpdate(
    { waId },
    { waId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  let conversation = await WaConversation.findOne({ contact: contact._id });
  if (!conversation) {
    conversation = await WaConversation.create({ contact: contact._id });
  }

  const preview =
    bodyParams.length > 0 ? `[template: ${templateName}] ${bodyParams.join(' · ')}` : `[template: ${templateName}]`;
  const timestamp = new Date();

  const message = await WaMessage.create({
    conversation: conversation._id,
    waMessageId,
    direction: 'outbound',
    type: 'template',
    text: preview,
    sentBy,
    status: 'sent',
    timestamp,
  });

  conversation.lastMessageAt = timestamp;
  conversation.lastMessagePreview = preview;
  await conversation.save();

  getIO().to('inbox:all').emit('new_message', { conversationId: conversation._id, message });
}
