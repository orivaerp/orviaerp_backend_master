const express = require('express');
const router = express.Router();

const {
  getAllConversations,
  getMessages,
  sendMessage,
  sendTemplateMessage,
  assignConversation,
  markRead,
} = require('./conversation.controller');

const { sendMessageSchema, assignSchema, sendTemplateSchema } = require('./conversation.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');

// The whole inbox is staff-only.
router.use(isAuthenticated);

router.get('/', getAllConversations);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', validate(sendMessageSchema), sendMessage);
router.post('/:id/template-messages', validate(sendTemplateSchema), sendTemplateMessage);
router.patch('/:id/assign', validate(assignSchema), assignConversation);
router.patch('/:id/read', markRead);

module.exports = router;
