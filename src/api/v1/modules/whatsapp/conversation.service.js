const WaConversation = require('./wa-conversation.model');
const WaMessage = require('./wa-message.model');

const CONTACT_FIELDS = 'waId name';
const AGENT_FIELDS = 'firstName lastName email';

// filter: 'all' | 'unassigned' | 'mine'
exports.findConversations = async ({ filter = 'all', userId } = {}) => {
  const query = {};
  if (filter === 'unassigned') query.assignedTo = null;
  if (filter === 'mine') query.assignedTo = userId;

  return WaConversation.find(query)
    .populate('contact', CONTACT_FIELDS)
    .populate('assignedTo', AGENT_FIELDS)
    .sort('-lastMessageAt');
};

exports.findConversationById = async (id) => {
  return WaConversation.findById(id).populate('contact', CONTACT_FIELDS).populate('assignedTo', AGENT_FIELDS);
};

exports.findMessages = async (conversationId) => {
  return WaMessage.find({ conversation: conversationId }).sort('timestamp');
};

exports.assignConversation = async (id, agentId) => {
  return WaConversation.findByIdAndUpdate(
    id,
    { assignedTo: agentId || null },
    { returnDocument: 'after', runValidators: true }
  )
    .populate('contact', CONTACT_FIELDS)
    .populate('assignedTo', AGENT_FIELDS);
};

exports.markRead = async (id) => {
  return WaConversation.findByIdAndUpdate(id, { unreadCount: 0 }, { returnDocument: 'after' })
    .populate('contact', CONTACT_FIELDS)
    .populate('assignedTo', AGENT_FIELDS);
};
