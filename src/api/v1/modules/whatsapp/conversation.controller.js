const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const conversationService = require('./conversation.service');
const cloudApi = require('./cloud-api.service');
const WaMessage = require('./wa-message.model');
const { getIO } = require('../../../../common/config/socket');

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function saveOutboundMessage(conversation, { waMessageId, type, text, sentBy }) {
  const message = await WaMessage.create({
    conversation: conversation._id,
    waMessageId,
    direction: 'outbound',
    type,
    text,
    sentBy,
    status: 'sent',
    timestamp: new Date(),
  });

  conversation.lastMessageAt = message.timestamp;
  conversation.lastMessagePreview = text ? text.slice(0, 120) : `[${type}]`;
  await conversation.save();

  getIO().to('inbox:all').emit('new_message', { conversationId: conversation._id, message });

  return message;
}

// @desc    List conversations
// @route   GET /api/v1/whatsapp/conversations?filter=all|unassigned|mine
exports.getAllConversations = catchAsync(async (req, res) => {
  const filter = req.query.filter || 'all';
  const conversations = await conversationService.findConversations({ filter, userId: req.user.id });
  return success(res, { message: 'Conversations fetched successfully', data: conversations });
});

// @desc    Get a conversation + its full message history
// @route   GET /api/v1/whatsapp/conversations/:id/messages
exports.getMessages = catchAsync(async (req, res) => {
  const conversation = await conversationService.findConversationById(req.params.id);
  if (!conversation) {
    return error(res, { statusCode: 404, message: 'Conversation not found' });
  }

  const messages = await conversationService.findMessages(req.params.id);
  return success(res, { message: 'Messages fetched successfully', data: { conversation, messages } });
});

// @desc    Reply to a conversation via the WhatsApp Cloud API
// @route   POST /api/v1/whatsapp/conversations/:id/messages
exports.sendMessage = catchAsync(async (req, res) => {
  const conversation = await conversationService.findConversationById(req.params.id);
  if (!conversation) {
    return error(res, { statusCode: 404, message: 'Conversation not found' });
  }

  const windowExpired =
    !conversation.lastInboundAt ||
    Date.now() - new Date(conversation.lastInboundAt).getTime() > TWENTY_FOUR_HOURS_MS;

  if (windowExpired) {
    return error(res, {
      statusCode: 409,
      message:
        "The 24-hour customer service window has closed for this contact - only pre-approved template messages can be sent now.",
    });
  }

  const waMessageId = await cloudApi.sendTextMessage(conversation.contact.waId, req.body.text);
  const message = await saveOutboundMessage(conversation, {
    waMessageId,
    type: 'text',
    text: req.body.text,
    sentBy: req.user.id,
  });

  return success(res, { statusCode: 201, message: 'Message sent successfully', data: message });
});

// @desc    Send a pre-approved template message - the only way to reach a
//          contact once the 24h customer-service window has closed.
// @route   POST /api/v1/whatsapp/conversations/:id/template-messages
exports.sendTemplateMessage = catchAsync(async (req, res) => {
  const conversation = await conversationService.findConversationById(req.params.id);
  if (!conversation) {
    return error(res, { statusCode: 404, message: 'Conversation not found' });
  }

  const { name, language, bodyParams = [] } = req.body;

  const waMessageId = await cloudApi.sendTemplateMessage(conversation.contact.waId, {
    name,
    language,
    bodyParams,
  });

  const preview = bodyParams.length > 0 ? `[template: ${name}] ${bodyParams.join(' · ')}` : `[template: ${name}]`;

  const message = await saveOutboundMessage(conversation, {
    waMessageId,
    type: 'template',
    text: preview,
    sentBy: req.user.id,
  });

  return success(res, { statusCode: 201, message: 'Template message sent successfully', data: message });
});

// @desc    Assign or unassign a conversation to/from an agent
// @route   PATCH /api/v1/whatsapp/conversations/:id/assign
exports.assignConversation = catchAsync(async (req, res) => {
  const conversation = await conversationService.assignConversation(req.params.id, req.body.assignedTo);
  if (!conversation) {
    return error(res, { statusCode: 404, message: 'Conversation not found' });
  }

  getIO().to('inbox:all').emit('conversation_assigned', conversation);
  if (req.body.assignedTo) {
    getIO().to(`agent:${req.body.assignedTo}`).emit('conversation_assigned', conversation);
  }

  return success(res, { message: 'Conversation updated successfully', data: conversation });
});

// @desc    Clear a conversation's unread count
// @route   PATCH /api/v1/whatsapp/conversations/:id/read
exports.markRead = catchAsync(async (req, res) => {
  const conversation = await conversationService.markRead(req.params.id);
  if (!conversation) {
    return error(res, { statusCode: 404, message: 'Conversation not found' });
  }
  return success(res, { message: 'Marked as read', data: conversation });
});
