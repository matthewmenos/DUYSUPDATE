import express from 'express';
import Joi from 'joi';
import * as messagingService from '../services/messagingService.js';
import { getIO } from '../services/socket.js';
import * as notificationsService from '../services/notificationsService.js';
import { AppError } from '../middleware/errorHandler.js';
import { queryOne } from '../config/database.js';

const router = express.Router();

/**
 * GET /messages?limit=&offset=
 * List the authenticated user's conversations, sorted by most recent activity.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const conversations = await messagingService.getConversations(req.userId, limit, offset);
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /messages/unread-count
 * Total unread messages across all conversations.
 */
router.get('/unread-count', async (req, res) => {
  try {
    const unread = await messagingService.getUnreadCount(req.userId);
    res.json({ unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /messages/:userId
 * Get (or create) a conversation with a specific user.
 */
router.get('/:userId', async (req, res) => {
  try {
    const conversation = await messagingService.getOrCreateConversation(req.userId, req.params.userId);
    res.json(conversation);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /messages/:conversationId/messages?limit=&beforeId=
 * Get messages in a conversation (newest first, cursor paginated).
 */
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;
    const messages = await messagingService.getMessages(
      req.params.conversationId,
      req.userId,
      limit,
      beforeId
    );
    res.json({ messages });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /messages/:conversationId/message
 * Send a message and broadcast it to the recipient.
 */
router.post('/:conversationId/message', async (req, res) => {
  const schema = Joi.object({
    body: Joi.string().min(1).max(5000).required()
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const message = await messagingService.sendMessage(
      req.params.conversationId,
      req.userId,
      value.body
    );
    const conv = await messagingService.getConversationById(message.conversation_id);
    const recipientId = Number(conv.participant_1_id) === Number(req.userId)
      ? conv.participant_2_id
      : conv.participant_1_id;
    // Notify the recipient's socket room.
    getIO()?.to(`user:${recipientId}`)
      .emit('dm:message', message);
    // Create a notification for the recipient.
    notificationsService.notifyMessageReceived(recipientId, req.userId, conv.id)
      .catch((e) => console.error('[notify]', e));
    res.status(201).json(message);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /messages/:messageId
 * Edit a message (sender only).
 */
router.patch('/messages/:messageId', async (req, res) => {
  const schema = Joi.object({
    body: Joi.string().min(1).max(5000).required()
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const message = await messagingService.editMessage(req.params.messageId, req.userId, value.body);
    getIO()?.to(`conversation:${message.conversation_id}`).emit('dm:message', message);
    res.json(message);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /messages/:messageId
 * Soft-delete a message (sender only).
 */
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const message = await messagingService.deleteMessage(req.params.messageId, req.userId);
    getIO()?.to(`conversation:${message.conversation_id}`).emit('dm:delete', {
      id: message.id,
      conversation_id: message.conversation_id
    });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /messages/:conversationId/read
 * Mark all incoming messages in a conversation as read.
 */
router.post('/:conversationId/read', async (req, res) => {
  try {
    const result = await messagingService.markAsRead(req.params.conversationId, req.userId);
        res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reactions ───────────────────────────────────────────────────────────
router.post('/:conversationId/messages/:messageId/react', async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji is required' });
  try {
    const result = await messagingService.toggleMessageReaction(req.params.messageId, req.userId, emoji);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pin / Unpin message ─────────────────────────────────────────────────
router.post('/messages/:messageId/pin', async (req, res) => {
  try {
    const result = await messagingService.pinMessage(req.params.messageId, req.userId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/messages/:messageId/pin', async (req, res) => {
  try {
    const result = await messagingService.unpinMessage(req.params.messageId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get pinned messages ─────────────────────────────────────────────────
router.get('/conversations/:conversationId/pins', async (req, res) => {
  try {
    const pins = await messagingService.getPinnedMessages(req.params.conversationId);
    res.json({ pins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clear conversation history ──────────────────────────────────────────
router.delete('/:conversationId/clear', async (req, res) => {
  try {
    const result = await messagingService.clearConversation(req.params.conversationId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Forward message ──────────────────────────────────────────────────────
router.post('/messages/:messageId/forward', async (req, res) => {
  const { targetConversationId } = req.body;
  try {
    const message = await messagingService.forwardMessage(
      req.params.messageId, targetConversationId, req.userId
    );
    res.status(201).json(message);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Block / Unblock ──────────────────────────────────────────────────────
router.post('/users/:targetId/block', async (req, res) => {
  try {
    const result = await messagingService.blockUser(req.userId, req.params.targetId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:targetId/block', async (req, res) => {
  try {
    const result = await messagingService.unblockUser(req.userId, req.params.targetId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blocked', async (req, res) => {
  try {
    const blocked = await messagingService.getBlockedUsers(req.userId);
    res.json({ blocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mute / Unmute conversation ───────────────────────────────────────────
router.post('/:conversationId/mute', async (req, res) => {
  try {
    const result = await messagingService.muteConversation(req.params.conversationId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:conversationId/mute', async (req, res) => {
  try {
    const result = await messagingService.unmuteConversation(req.params.conversationId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Media gallery ────────────────────────────────────────────────────────
router.get('/:conversationId/media', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const media = await messagingService.getConversationMedia(
      req.params.conversationId, req.userId, limit, offset
    );
    res.json({ media });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// GROUP CONVERSATIONS
// ============================================================================

router.get('/groups', async (req, res) => {
  try {
    const groups = await messagingService.getUserGroups(req.userId);
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups', async (req, res) => {
  const { name, description = '', avatarUrl = null } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });
  try {
    const group = await messagingService.createGroup(req.userId, { name, description, avatarUrl });
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups/unread', async (req, res) => {
  try {
    const count = await messagingService.getGroupUnreadCount(req.userId);
    res.json({ unread: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups/:groupId', async (req, res) => {
  try {
    const group = await messagingService.getGroupById(req.params.groupId, req.userId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups/join/:inviteToken', async (req, res) => {
  try {
    const group = await messagingService.joinGroupByInvite(req.userId, req.params.inviteToken);
    res.json(group);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups/:groupId/regen-invite', async (req, res) => {
  try {
    const result = await messagingService.regenGroupInvite(req.params.groupId, req.userId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        res.status(403).json({ error: err.message });
  }
});

router.post('/groups/:groupId/members/:targetId/promote', async (req, res) => {
  try {
    const result = await messagingService.promoteGroupMember(req.params.groupId, req.userId, req.params.targetId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(403).json({ error: err.message });
  }
});

router.post('/groups/:groupId/members/:targetId/demote', async (req, res) => {
  try {
    const result = await messagingService.demoteGroupMember(req.params.groupId, req.userId, req.params.targetId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(403).json({ error: err.message });
  }
});

router.delete('/groups/:groupId/members/:targetId', async (req, res) => {
  try {
    const result = await messagingService.removeGroupMember(req.params.groupId, req.userId, req.params.targetId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(403).json({ error: err.message });
  }
});

router.delete('/groups/:groupId/leave', async (req, res) => {
  try {
    const result = await messagingService.leaveGroup(req.params.groupId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups/:groupId/members', async (req, res) => {
  try {
    const members = await messagingService.getGroupMembers(req.params.groupId);
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups/:groupId/messages', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;
  try {
    const messages = await messagingService.getGroupMessages(req.params.groupId, req.userId, limit, beforeId);
    res.json({ messages });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups/:groupId/message', async (req, res) => {
  const { body: textBody } = req.body;
  if (!textBody || !textBody.trim()) return res.status(400).json({ error: 'Body is required' });
  try {
    const message = await messagingService.sendGroupMessage(req.params.groupId, req.userId, textBody.trim());
    if (!message) return res.status(200).json({ muted: true });

    const recipientIds = await messagingService.getGroupRecipientIds(req.params.groupId);
    recipientIds.forEach((rid) => {
      if (Number(rid) !== Number(req.userId)) {
        notificationsService.notifyGroupMention(rid, req.userId, message.id)
          .catch((e) => console.error('[notify]', e));
      }
    });
    res.status(201).json(message);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups/:groupId/messages/:messageId/react', async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji is required' });
  try {
    const member = await queryOne(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.groupId, req.userId]
    );
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const result = await messagingService.toggleGroupMessageReaction(
      req.params.messageId, req.userId, emoji
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups/:groupId/mute', async (req, res) => {
  try {
    await query(
      'INSERT INTO group_members (group_id, user_id, muted) VALUES ($1, $2, true) ON CONFLICT (group_id, user_id) DO UPDATE SET muted = true',
      [req.params.groupId, req.userId]
    );
    res.json({ muted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/groups/:groupId/mute', async (req, res) => {
  try {
    await query('UPDATE group_members SET muted = false WHERE group_id = $1 AND user_id = $2',
      [req.params.groupId, req.userId]);
    res.json({ muted: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
