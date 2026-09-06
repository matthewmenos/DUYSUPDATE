import crypto from 'crypto';
import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as notificationsService from './notificationsService.js';
import * as textService from './textService.js';
import { getIO } from './socket.js';

/**
 * Direct messaging service (1:1 conversations) plus group conversation support.
 *
 * Schema: conversations, messages, message_reactions, message_pins,
 * conversation_blocks, conversation_mutes, group_conversations,
 * group_members, group_messages, group_message_reactions.
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

// ============================================================================
// Message reactions (toggle)
// ============================================================================
export async function toggleMessageReaction(messageId, userId, emoji) {
  const existing = await queryOne(
    'SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2',
    [messageId, userId]
  );

  let result;
  if (existing) {
    if (existing.emoji === emoji) {
      await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2',
        [messageId, userId]);
      result = null;
    } else {
      result = await queryOne(
        'UPDATE message_reactions SET emoji = $1 WHERE message_id = $2 AND user_id = $3 RETURNING emoji',
        [emoji, messageId, userId]
      );
    }
  } else {
    result = await queryOne(
      'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) RETURNING emoji',
      [messageId, userId, emoji]
    );
  }

  const message = await queryOne('SELECT conversation_id FROM messages WHERE id = $1',
    [messageId]);
  if (message) {
    getIO()?.to(`conversation:${message.conversation_id}`).emit('dm:reaction', {
      messageId, userId, emoji: result ? result.emoji : null
    });
  }
  return { emoji: result ? result.emoji : null };
}

// ============================================================================
// Message pins
// ============================================================================
export async function pinMessage(messageId, userId) {
  const message = await queryOne('SELECT conversation_id, sender_id FROM messages WHERE id = $1',
    [messageId]);
  if (!message) throw new AppError('Message not found', 404);
  if (message.sender_id !== parseInt(userId, 10)) {
    throw new AppError('Only the sender can pin this message', 403);
  }

  await query(
    'INSERT INTO message_pins (message_id, pinned_by) VALUES ($1, $2) ON CONFLICT (message_id) DO UPDATE SET pinned_by = $2',
    [messageId, userId]
  );
  getIO()?.to(`conversation:${message.conversation_id}`).emit('dm:message', {
    id: messageId, conversation_id: message.conversation_id, pinned: true
  });
  return { pinned: true };
}

export async function unpinMessage(messageId, userId) {
  const message = await queryOne('SELECT conversation_id FROM messages WHERE id = $1',
    [messageId]);
  if (!message) throw new AppError('Message not found', 404);

  await query('DELETE FROM message_pins WHERE message_id = $1', [messageId]);
  getIO()?.to(`conversation:${message.conversation_id}`).emit('dm:message', {
    id: messageId, conversation_id: message.conversation_id, pinned: false
  });
  return { pinned: false };
}

export async function getPinnedMessages(conversationId) {
  return queryAll(
    `SELECT m.id, m.body, m.sender_id, m.created_at, mp.pinned_at,
            u.username, u.display_name, u.avatar_url
     FROM message_pins mp JOIN messages m ON m.id = mp.message_id
     JOIN users u ON m.sender_id = u.id
     WHERE mp.conversation_id = $1
     ORDER BY mp.pinned_at DESC`,
    [conversationId]
  );
}

// ============================================================================
// Clear conversation history
// ============================================================================
export async function clearConversation(conversationId, userId) {
  const conv = await queryOne(
    'SELECT id FROM conversations WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)',
    [conversationId, userId]
  );
  if (!conv) throw new AppError('Conversation not found', 404);
  await query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
  return { cleared: true };
}

// ============================================================================
// Forward a message to another conversation
// ============================================================================
export async function forwardMessage(messageId, targetConversationId, userId) {
  const message = await queryOne('SELECT body FROM messages WHERE id = $1', [messageId]);
  if (!message) throw new AppError('Message not found', 404);

  const sourceConv = await queryOne(
    'SELECT id FROM conversations WHERE id = (SELECT conversation_id FROM messages WHERE id = $1) AND (participant_1_id = $2 OR participant_2_id = $2)',
    [messageId, userId]
  );
  if (!sourceConv) throw new AppError('Cannot access this message', 403);

  const targetConv = await queryOne(
    'SELECT id FROM conversations WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)',
    [targetConversationId, userId]
  );
  if (!targetConv) throw new AppError('Target conversation not found', 404);

  const result = await query(
    `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)
     RETURNING id, conversation_id, sender_id, body, read_at, created_at, updated_at`,
    [targetConversationId, userId, message.body]
  );
  getIO()?.to(`conversation:${targetConversationId}`).emit('dm:message', result.rows[0]);
  return result.rows[0];
}

// ============================================================================
// Block / unblock
// ============================================================================
export async function blockUser(userId, blockedId) {
  if (Number(userId) === Number(blockedId)) throw new AppError('Cannot block yourself', 400);
  await query('INSERT INTO conversation_blocks (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, blockedId]);
  return { blocked: true };
}

export async function unblockUser(userId, blockedId) {
  await query('DELETE FROM conversation_blocks WHERE user_id = $1 AND blocked_id = $2',
    [userId, blockedId]);
  return { blocked: false };
}

export async function getBlockedUsers(userId) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge, cb.created_at
     FROM conversation_blocks cb JOIN users u ON u.id = cb.blocked_id
     WHERE cb.user_id = $1 ORDER BY cb.created_at DESC`,
    [userId]
  );
}

export async function isBlocked(userId, otherId) {
  const row = await queryOne(
    `SELECT 1 FROM conversation_blocks
     WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1) LIMIT 1`,
    [userId, otherId]
  );
  return !!row;
}

// ============================================================================
// Mute / unmute conversation
// ============================================================================
export async function muteConversation(userId, conversationId) {
  await query('INSERT INTO conversation_mutes (user_id, conversation_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, conversationId]);
  return { muted: true };
}

export async function unmuteConversation(userId, conversationId) {
  await query('DELETE FROM conversation_mutes WHERE user_id = $1 AND conversation_id = $2',
    [userId, conversationId]);
  return { muted: false };
}

export async function isMuted(userId, conversationId) {
  const row = await queryOne(
    'SELECT 1 FROM conversation_mutes WHERE user_id = $1 AND conversation_id = $2',
    [userId, conversationId]
  );
  return !!row;
}

// ============================================================================
// Media gallery
// ============================================================================
export async function getConversationMedia(conversationId, userId, limit = 50, offset = 0) {
  const conv = await queryOne(
    'SELECT id FROM conversations WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)',
    [conversationId, userId]
  );
  if (!conv) throw new AppError('Conversation not found', 404);

  return queryAll(
    `SELECT m.id, m.body, m.sender_id, m.created_at,
            u.username, u.display_name, u.avatar_url
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
       AND m.body ~ '\\.(jpg|jpeg|png|gif|webp|mov|mp4|webm)(\\?|$)'
     ORDER BY m.created_at DESC LIMIT $3 OFFSET $4`,
    [conversationId, userId, limit, offset]
    );
}

// ============================================================================
// Group conversations
// ============================================================================
export async function createGroup(userId, { name, description = '', avatarUrl = '' }) {
  const token = crypto.randomBytes(16).toString('hex');
  const result = await query(
    `INSERT INTO group_conversations (name, description, avatar_url, created_by, invite_token)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, description, avatar_url, invite_token, is_verified, verified_badge, created_at, updated_at`,
    [name, description, avatarUrl, userId, token]
  );
  const group = result.rows[0];

  await query(
    'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
    [group.id, userId, 'owner']
  );

  return group;
}

export async function getGroupById(groupId, userId = null) {
  const group = await queryOne('SELECT * FROM group_conversations WHERE id = $1', [groupId]);
  if (!group) return null;

  if (userId) {
    const member = await queryOne(
      'SELECT role, muted FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    group.my_role = member ? member.role : null;
    group.my_muted = member ? member.muted : false;
    group.is_member = !!member;
  }

  return group;
}

export async function joinGroupByInvite(userId, inviteToken) {
  const group = await queryOne(
    'SELECT id, name, description, avatar_url, is_verified, verified_badge FROM group_conversations WHERE invite_token = $1',
    [inviteToken]
  );
  if (!group) throw new AppError('Invalid invite token', 404);

  await query(
    'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [group.id, userId, 'member']
  );
  return group;
}

export async function regenGroupInvite(groupId, userId) {
  const myRole = await queryOne(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!myRole || myRole.role !== 'owner') {
    throw new AppError('Only the owner can regenerate invite', 403);
  }

  const token = crypto.randomBytes(16).toString('hex');
  await query('UPDATE group_conversations SET invite_token = $1 WHERE id = $2', [token, groupId]);
  return { inviteToken: token };
}

export async function promoteGroupMember(groupId, userId, targetId) {
  const myRole = await queryOne(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!myRole || myRole.role !== 'owner') {
    throw new AppError('Only the owner can promote', 403);
  }

  await query('UPDATE group_members SET role = $1 WHERE group_id = $2 AND user_id = $3',
    ['admin', groupId, targetId]);
  return { promoted: true };
}

export async function demoteGroupMember(groupId, userId, targetId) {
  const myRole = await queryOne(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!myRole || myRole.role !== 'owner') {
    throw new AppError('Only the owner can demote', 403);
  }

  await query('UPDATE group_members SET role = $1 WHERE group_id = $2 AND user_id = $3',
    ['member', groupId, targetId]);
  return { demoted: true };
}

export async function removeGroupMember(groupId, userId, targetId) {
  const myRole = await queryOne(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!myRole || (myRole.role !== 'owner' && myRole.role !== 'admin')) {
    throw new AppError('Only owner or admin can remove', 403);
  }

  await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, targetId]);
  return { removed: true };
}

export async function leaveGroup(groupId, userId) {
  const myRole = await queryOne(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!myRole) throw new AppError('Not a member', 404);

  await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]);
  return { left: true };
}

export async function getGroupMembers(groupId, limit = 100, offset = 0) {
  return queryAll(
    `SELECT gm.role, gm.muted, gm.joined_at,
            u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.role DESC, gm.joined_at ASC
     LIMIT $2 OFFSET $3`,
    [groupId, limit, offset]
  );
}

// ============================================================================
// Group messages
// ============================================================================
export async function getGroupMessages(groupId, userId, limit = 50, beforeId = null) {
  const member = await queryOne(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!member) throw new AppError('Not a member of this group', 403);

  const q = beforeId
    ? `SELECT m.id, m.group_id, m.sender_id, m.body, m.read_at, m.created_at, m.updated_at, m.deleted_at,
              u.username, u.display_name, u.avatar_url, u.verified_badge
       FROM group_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = $1 AND m.id < $2
       ORDER BY m.id DESC LIMIT $3`
    : `SELECT m.id, m.group_id, m.sender_id, m.body, m.read_at, m.created_at, m.updated_at, m.deleted_at,
              u.username, u.display_name, u.avatar_url, u.verified_badge
       FROM group_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = $1
       ORDER BY m.id DESC LIMIT $2`;

  const params = beforeId ? [groupId, beforeId, limit] : [groupId, limit];
  return queryAll(q, params);
}

export async function sendGroupMessage(groupId, userId, body) {
  const member = await queryOne(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (!member) throw new AppError('Not a member of this group', 403);

  const muted = await queryOne(
    'SELECT muted FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  if (muted?.muted) return null;

  const result = await query(
    `INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3)
     RETURNING id, group_id, sender_id, body, read_at, created_at, updated_at, deleted_at`,
    [groupId, userId, body]
  );
  const message = result.rows[0];

  await query('UPDATE group_conversations SET updated_at = NOW() WHERE id = $1', [groupId]);
  getIO()?.to(`group:${groupId}`).emit('group:message', message);

  // Notify mentions
  const mentions = textService.extractMentions(body);
  for (const mention of mentions) {
    const mentionedUser = await queryOne('SELECT id FROM users WHERE username = $1', [mention]);
    if (mentionedUser) {
      notificationsService.notifyMentioned(message.id, mentionedUser.id, userId)
        .catch((e) => console.error('[notify]', e));
    }
  }

  return message;
}

export async function toggleGroupMessageReaction(messageId, userId, emoji) {
  const existing = await queryOne(
    'SELECT emoji FROM group_message_reactions WHERE message_id = $1 AND user_id = $2',
    [messageId, userId]
  );

  let result;
  if (existing) {
    if (existing.emoji === emoji) {
      await query('DELETE FROM group_message_reactions WHERE message_id = $1 AND user_id = $2',
        [messageId, userId]);
      result = null;
    } else {
      result = await queryOne(
        'UPDATE group_message_reactions SET emoji = $1 WHERE message_id = $2 AND user_id = $3 RETURNING emoji',
        [emoji, messageId, userId]
      );
    }
  } else {
    result = await queryOne(
      'INSERT INTO group_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) RETURNING emoji',
      [messageId, userId, emoji]
    );
  }

  const message = await queryOne('SELECT group_id FROM group_messages WHERE id = $1',
    [messageId]);
  if (message) {
    getIO()?.to(`group:${message.group_id}`).emit('group:reaction', {
      messageId, userId, emoji: result ? result.emoji : null
    });
  }
  return { emoji: result ? result.emoji : null };
}

export async function getGroupUnreadCount(userId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS unread
     FROM group_messages gm
     JOIN group_members gmm ON gmm.group_id = gm.group_id
     WHERE gmm.user_id = $1 AND gm.sender_id != $1 AND gm.read_at IS NULL`,
    [userId]
  );
  return row ? row.unread : 0;
}

export async function getGroupRecipientIds(groupId) {
  const rows = await queryAll(
    'SELECT user_id FROM group_members WHERE group_id = $1',
    [groupId]
  );
  return rows.map((r) => r.user_id);
}

export async function getUserGroups(userId, limit = 50, offset = 0) {
  return queryAll(
    `SELECT gc.id, gc.name, gc.description, gc.created_by AS owner_id, gc.avatar_url, gc.invite_token, gc.created_at, gc.updated_at,
            gm.role, gm.muted, gm.joined_at,
            u.username, u.display_name, u.avatar_url, u.verified_badge,
            (SELECT COUNT(*) FROM group_messages gmm2
             JOIN group_members gm3 ON gm3.group_id = gmm2.group_id
             WHERE gm3.user_id = $1 AND gmm2.sender_id != $1
               AND gmm2.read_at IS NULL) AS unread
     FROM group_members gm
     JOIN group_conversations gc ON gc.id = gm.group_id
     JOIN users u ON u.id = gc.created_by
     WHERE gm.user_id = $1 AND u.is_banned = false
     ORDER BY gc.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
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
  getUnreadCount,
  // Reactions
  toggleMessageReaction,
  // Pins
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  // Clear / Forward
  clearConversation,
  forwardMessage,
  // Blocks
  blockUser,
  unblockUser,
  getBlockedUsers,
  isBlocked,
  // Mutes
  muteConversation,
  unmuteConversation,
  isMuted,
  // Media
  getConversationMedia,
  // Groups
  createGroup,
  getGroupById,
  joinGroupByInvite,
  regenGroupInvite,
  promoteGroupMember,
  demoteGroupMember,
  removeGroupMember,
  leaveGroup,
  getGroupMembers,
  getGroupMessages,
  sendGroupMessage,
  toggleGroupMessageReaction,
  getGroupUnreadCount
};