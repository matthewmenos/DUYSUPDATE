import express from 'express';
import Joi from 'joi';
import * as messagingService from '../services/messagingService.js';
import { getIO } from '../services/socket.js';
import * as notificationsService from '../services/notificationsService.js';
import { AppError } from '../middleware/errorHandler.js';

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

export default router;
