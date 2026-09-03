import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from './socket.js';

/**
 * Notifications service.
 *
 * Adapted to the actual schema:
 * - Read state is tracked with `read_at` (a TIMESTAMP, NULL = unread),
 *   not a boolean `is_read` column.
 * - The kind is stored in `kind` (CHECK constraint on a fixed allow-list),
 *   and the linked resource uses `entity_type`/`entity_id` (there is no
 *   `target_id` column).
 * - `title` is NOT NULL and `message` defaults to ''.
 */

const ACTOR_SELECT = `
  u.id AS actor_id, u.username AS actor_username,
  u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url,
  u.verified_badge AS actor_verified_badge
`;

/**
 * Fetch a single notification (with actor profile) that belongs to a user.
 */
async function getNotificationById(notificationId, userId) {
  return queryOne(
    `SELECT n.id, n.user_id, n.kind, n.title, n.message, n.entity_type, n.entity_id,
            n.read_at, n.created_at,
            ${ACTOR_SELECT}
     FROM notifications n
     JOIN users u ON n.actor_id = u.id
     WHERE n.id = $1 AND n.user_id = $2`,
    [notificationId, userId]
  );
}

/**
 * Insert a notification and emit it over Socket.io to the recipient's room.
 */
export async function createNotification({ userId, actorId, kind, title, message = '', entityType = null, entityId = null }) {
  const target = Number(userId);
  const actor = Number(actorId);

  // Never notify yourself about your own action.
  if (!target || target === actor) return null;

  const validKinds = ['like', 'comment', 'follow', 'mention', 'repost', 'quote', 'message', 'subscription', 'verification', 'payment', 'system'];
  const safeKind = validKinds.includes(kind) ? kind : 'system';

  const result = await query(
    `INSERT INTO notifications (user_id, actor_id, kind, title, message, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, kind, title, message, entity_type, entity_id, read_at, created_at`,
    [target, actor, safeKind, String(title).slice(0, 255), String(message || '').slice(0, 500), entityType, entityId]
  );

  const notification = await getNotificationById(result.rows[0].id, target);

  // Broadcast to the recipient's socket room in real-time.
  getIO()?.to(`user:${target}`).emit('notification:new', notification);

  return notification;
}

/**
 * List a user's notifications, newest first, unread prioritized.
 */
export async function getNotifications(userId, limit = 20, offset = 0) {
  return queryAll(
    `SELECT n.id, n.user_id, n.kind, n.title, n.message, n.entity_type, n.entity_id,
            n.read_at, n.created_at,
            ${ACTOR_SELECT}
     FROM notifications n
     JOIN users u ON n.actor_id = u.id
     WHERE n.user_id = $1
     ORDER BY (n.read_at IS NULL) DESC, n.created_at DESC, n.id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
}

/**
 * Count unread notifications for a user.
 */
export async function getUnreadCount(userId) {
  const row = await queryOne(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return row ? row.count : 0;
}
/**
 * Mark a single notification as read (owner only).
 */
export async function markAsRead(notificationId, userId) {
  const result = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Notification not found', 404);
  }
  const notification = await getNotificationById(notificationId, userId);
  getIO()?.to(`user:${userId}`).emit('notification:read', notification);
  return notification;
}

/**
 * Mark all of a user's notifications as read.
 */
export async function markAllAsRead(userId) {
  const result = await query(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = $1',
    [userId]
  );
  return { updated: result.rowCount };
}

/**
 * Delete a notification (owner only).
 */
export async function deleteNotification(notificationId, userId) {
  const result = await query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Notification not found', 404);
  }
  getIO()?.to(`user:${userId}`).emit('notification:deleted', { id: Number(notificationId) });
  return { success: true };
}

/**
 * Unread count plus a preview of the latest notifications.
 */
export async function getUnreadPreview(userId, previewLimit = 5) {
  const [count, preview] = await Promise.all([
    getUnreadCount(userId),
    queryAll(
      `SELECT n.id, n.user_id, n.kind, n.title, n.message, n.entity_type, n.entity_id,
              n.read_at, n.created_at,
              ${ACTOR_SELECT}
       FROM notifications n
       JOIN users u ON n.actor_id = u.id
       WHERE n.user_id = $1
       ORDER BY (n.read_at IS NULL) DESC, n.created_at DESC, n.id DESC
       LIMIT $2`,
      [userId, previewLimit]
    )
  ]);
  return { unread: count, preview };
}
/**
 * Resolve a "verb" into a human readable title using the actor's username.
 */
async function actorTitle(actorId, verb) {
  const actor = await queryOne('SELECT username FROM users WHERE id = $1', [actorId]);
  const handle = actor ? actor.username : 'Someone';
  return `@${handle} ${verb}`;
}

// ============================================================================
// Integration helpers (call these from other services/routes)
// ============================================================================

async function notifyForPost(postId, actorId, kind, verb, extra = 'your post') {
  const post = await queryOne('SELECT author_id FROM posts WHERE id = $1', [postId]);
  if (!post) return null;
  const title = await actorTitle(actorId, verb);
  return createNotification({
    userId: post.author_id,
    actorId,
    kind,
    title,
    message: extra,
    entityType: 'post',
    entityId: Number(postId)
  });
}

/** Someone liked your post. */
export async function notifyPostLiked(postId, actorId) {
  return notifyForPost(postId, actorId, 'like', 'liked');
}

/** Someone commented on your post. */
export async function notifyCommented(postId, actorId) {
  return notifyForPost(postId, actorId, 'comment', 'commented on');
}

/** Someone reposted your post. */
export async function notifyReposted(postId, actorId) {
  return notifyForPost(postId, actorId, 'repost', 'reposted');
}

/** Someone quoted your post. */
export async function notifyQuoted(postId, actorId) {
  return notifyForPost(postId, actorId, 'quote', 'quoted');
}

/** Someone followed you. */
export async function notifyFollowed(targetId, actorId) {
  const title = await actorTitle(actorId, 'followed you');
  return createNotification({
    userId: targetId,
    actorId,
    kind: 'follow',
    title,
    message: '',
    entityType: 'user',
    entityId: Number(actorId)
  });
}

/** You were mentioned (@username) in a post. */
export async function notifyMentioned(postId, mentionedUserId, actorId) {
  const post = await queryOne('SELECT author_id, body FROM posts WHERE id = $1', [postId]);
  if (!post) return null;
  const title = await actorTitle(actorId, 'mentioned you in a post');
  return createNotification({
    userId: mentionedUserId,
    actorId,
    kind: 'mention',
    title,
    message: (post.body || '').slice(0, 140),
    entityType: 'post',
    entityId: Number(postId)
  });
}

/** You received a new direct message. */
export async function notifyMessageReceived(recipientId, actorId, conversationId) {
  const title = await actorTitle(actorId, 'sent you a message');
  return createNotification({
    userId: recipientId,
    actorId,
    kind: 'message',
    title,
    message: '',
    entityType: 'conversation',
    entityId: Number(conversationId)
  });
}

export default {
  createNotification,
  getNotifications,
  getUnreadCount,
  getUnreadPreview,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  notifyPostLiked,
  notifyCommented,
  notifyReposted,
  notifyQuoted,
  notifyFollowed,
  notifyMentioned,
  notifyMessageReceived
};