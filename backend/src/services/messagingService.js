import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Direct messaging service.
 *
 * Adapted to the actual schema:
 * - `conversations` uses `updated_at` for sorting (no `last_message_at` column)
 *   and enforces `participant_1_id < participant_2_id` (ordered participants).
 * - `messages` tracks reads via `read_at` (not `is_read`) and has no `media_url`
 *   column, so media is not persisted for now.
 */

/**
 * Order two participant ids so participant_1_id < participant_2_id.
 */
function normalizeParticipants(a, b) {
  const p1 = Math.min(Number(a), Number(b));
  const p2 = Math.max(Number(a), Number(b));
  return { p1, p2 };
}

/**
 * List all conversations for a user, sorted by most recent activity.
 */
export async function getConversations(userId, limit = 20, offset = 0) {
  const conversations = await queryAll(
    `SELECT c.id, c.participant_1_id, c.participant_2_id, c.updated_at,
            u.id AS other_user_id, u.username, u.display_name, u.avatar_url, u.verified_badge,
            lm.id AS last_message_id, lm.body AS last_message_body,
            lm.sender_id AS last_message_sender_id, lm.created_at AS last_message_at
     FROM conversations c
     JOIN users u ON u.id = CASE
       WHEN c.participant_1_id = $1 THEN c.participant_2_id
       ELSE c.participant_1_id
     END
     LEFT JOIN LATERAL (
       SELECT id, body, sender_id, created_at
       FROM messages
       WHERE conversation_id = c.id AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     ) lm ON true
     WHERE $1 IN (c.participant_1_id, c.participant_2_id)
     ORDER BY c.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  if (conversations.length === 0) return [];

  // Unread counts for the returned conversations.
  const ids = conversations.map((c) => c.id);
  const unreadRows = await queryAll(
    `SELECT conversation_id, COUNT(*)::int AS unread
     FROM messages
     WHERE sender_id != $1 AND read_at IS NULL AND conversation_id = ANY($2::int[])
     GROUP BY conversation_id`,
    [userId, ids]
  );
  const unreadMap = new Map(unreadRows.map((r) => [r.conversation_id, r.unread]));

  return conversations.map((c) => ({
    ...c,
    unread_count: unreadMap.get(c.id) || 0
  }));
}

/**
 * Get an existing conversation between two users, or create one if missing.
 */
export async function getOrCreateConversation(userId1, userId2) {
  if (Number(userId1) === Number(userId2)) {
    throw new AppError('Cannot message yourself', 400);
  }

  const { p1, p2 } = normalizeParticipants(userId1, userId2);

  let conversation = await queryOne(
    'SELECT * FROM conversations WHERE participant_1_id = $1 AND participant_2_id = $2',
    [p1, p2]
  );

  if (!conversation) {
    const result = await query(
      `INSERT INTO conversations (participant_1_id, participant_2_id)
       VALUES ($1, $2)
       RETURNING *`,
      [p1, p2]
    );
    conversation = result.rows[0];
  }

  return conversation;
}
/**
 * Get messages in a conversation, newest first, cursor (beforeId) paginated.
 */
export async function getMessages(conversationId, userId, limit = 50, beforeId = null) {
  // Ensure the user is a participant.
  const conv = await queryOne(
    'SELECT id FROM conversations WHERE id = $1 AND $2 IN (participant_1_id, participant_2_id)',
    [conversationId, userId]
  );
  if (!conv) {
    throw new AppError('Conversation not found', 404);
  }

  const rows = await queryAll(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at, m.created_at, m.updated_at,
            u.username, u.display_name, u.avatar_url
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
       AND ($2::int IS NULL OR m.id < $2)
     ORDER BY m.id DESC
     LIMIT $3`,
    [conversationId, beforeId, limit]
  );

  return rows;
}

/**
 * Send a message and bump the conversation's updated_at.
 */
export async function sendMessage(conversationId, userId, body) {
  const conv = await queryOne(
    'SELECT id FROM conversations WHERE id = $1 AND $2 IN (participant_1_id, participant_2_id)',
    [conversationId, userId]
  );
  if (!conv) {
    throw new AppError('Conversation not found', 404);
  }

  const result = await query(
    `INSERT INTO messages (conversation_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, conversation_id, sender_id, body, read_at, created_at, updated_at`,
    [conversationId, userId, body]
  );

  await query(
    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
    [conversationId]
  );

  const message = await queryOne(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at, m.created_at, m.updated_at,
            u.username, u.display_name, u.avatar_url
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.id = $1`,
    [result.rows[0].id]
  );

  return message;
}

/**
 * Edit a message (sender only), bumping updated_at.
 */
export async function editMessage(messageId, userId, body) {
  const message = await queryOne('SELECT * FROM messages WHERE id = $1', [messageId]);
  if (!message || message.deleted_at) {
    throw new AppError('Message not found', 404);
  }
  if (message.sender_id !== parseInt(userId, 10)) {
    throw new AppError('Only the sender can edit this message', 403);
  }

  await queryOne(
    `UPDATE messages SET body = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id`,
    [body, messageId]
  );

  return queryOne(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at, m.created_at, m.updated_at,
            u.username, u.display_name, u.avatar_url
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.id = $1`,
    [messageId]
  );
}

/**
 * Soft-delete a message (sender only).
 */
export async function deleteMessage(messageId, userId) {
  const message = await queryOne('SELECT * FROM messages WHERE id = $1', [messageId]);
  if (!message || message.deleted_at) {
    throw new AppError('Message not found', 404);
  }
  if (message.sender_id !== parseInt(userId, 10)) {
    throw new AppError('Only the sender can delete this message', 403);
  }

  return queryOne(
    `UPDATE messages SET deleted_at = NOW()
     WHERE id = $1
     RETURNING id, conversation_id, sender_id, deleted_at`,
    [messageId]
  );
}

/**
 * Get a conversation row by id.
 */
export async function getConversationById(conversationId) {
  return queryOne('SELECT * FROM conversations WHERE id = $1', [conversationId]);
}

/**
 * Mark all incoming messages in a conversation as read.
 */
export async function markAsRead(conversationId, userId) {
  const result = await query(
    `UPDATE messages SET read_at = NOW()
     WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
    [conversationId, userId]
  );
  return { updated: result.rowCount };
}

/**
 * Count total unread messages across all of a user's conversations.
 */
export async function getUnreadCount(userId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS unread
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE m.sender_id != $1 AND m.read_at IS NULL
       AND $1 IN (c.participant_1_id, c.participant_2_id)`,
    [userId]
  );
  return row ? row.unread : 0;
}

export default {
  getConversations,
  getOrCreateConversation,
  getConversationById,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  getUnreadCount
};