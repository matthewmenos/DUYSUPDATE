import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Channels / Communities service.
 *
 * Adapted to the actual schema:
 * - `channels` uses `owner_id` (not `moderator_id`) and has a required `handle`,
 *   a denormalized `subscriber_count` counter and `updated_at`.
 * - Subscriptions live in `channel_subscriptions` (NOT `subscriptions`) with a
 *   UNIQUE(channel_id, user_id) constraint.
 * - Roles are tracked in `channel_members` (owner/moderator/member).
 */

/**
 * Create a channel. The creator becomes the owner (also recorded in
 * channel_members so the role is reflected there).
 */
export async function createChannel(userId, { name, handle, description = '', isPrivate = false }) {
  const result = await query(
    `INSERT INTO channels (owner_id, name, handle, description, is_private)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (handle) DO NOTHING
     RETURNING *`,
    [userId, name, handle, description, isPrivate]
  );

  if (!result.rows[0]) {
    throw new AppError('Handle already taken', 409);
  }

  // Record the owner role.
  await query(
    `INSERT INTO channel_members (channel_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [result.rows[0].id, userId]
  );

  return result.rows[0];
}

/**
 * List public channels, ordered by subscriber count.
 */
export async function getChannels(limit = 20, offset = 0) {
  return queryAll(
    `SELECT c.id, c.name, c.handle, c.description, c.avatar_url, c.banner_url,
            c.owner_id, c.is_private, c.subscriber_count,
            c.created_at, u.username AS owner_username, u.display_name AS owner_display_name
     FROM channels c
     JOIN users u ON c.owner_id = u.id
     WHERE c.is_private = false
     ORDER BY c.subscriber_count DESC, c.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

/**
 * Get a single channel with subscriber count and the viewer's subscriptions.
 */
export async function getChannelById(channelId, userId = null) {
  const channel = await queryOne(
    `SELECT c.*, u.username AS owner_username, u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url
     FROM channels c
     JOIN users u ON c.owner_id = u.id
     WHERE c.id = $1`,
    [channelId]
  );
  if (!channel) return null;

  let isSubscribed = false;
  let role = null;
  if (userId) {
    const sub = await queryOne(
      'SELECT id FROM channel_subscriptions WHERE channel_id = $1 AND user_id = $2',
      [channelId, userId]
    );
    isSubscribed = !!sub;

    const member = await queryOne(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, userId]
    );
    role = member ? member.role : null;
  }

  return { ...channel, is_subscribed: isSubscribed, my_role: role };
}
/**
 * Update channel fields (owner or moderator only).
 */
export async function updateChannel(channelId, userId, updates) {
  const channel = await queryOne('SELECT * FROM channels WHERE id = $1', [channelId]);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  const allowed = channel.owner_id === parseInt(userId, 10) ||
    (await queryOne(
      `SELECT id FROM channel_members
       WHERE channel_id = $1 AND user_id = $2 AND role IN ('owner', 'moderator')`,
      [channelId, userId]
    ));
  if (!allowed) {
    throw new AppError('Only the owner or a moderator can update this channel', 403);
  }

  const allowedFields = ['name', 'description', 'avatar_url', 'banner_url', 'is_private'];
  const fields = [];
  const values = [];
  let param = 1;
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${param++}`);
      values.push(value);
    }
  }
  if (fields.length === 0) return channel;

  values.push(channelId);
  return queryOne(
    `UPDATE channels SET ${fields.join(', ')} WHERE id = $${param} RETURNING *`,
    values
  );
}

/**
 * Delete a channel (owner only).
 */
export async function deleteChannel(channelId, userId) {
  const channel = await queryOne('SELECT * FROM channels WHERE id = $1', [channelId]);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }
  if (channel.owner_id !== parseInt(userId, 10)) {
    throw new AppError('Only the owner can delete this channel', 403);
  }

  await query('DELETE FROM channels WHERE id = $1', [channelId]);
  return { success: true };
}

/**
 * Subscribe to a channel (idempotent).
 */
export async function subscribeToChannel(userId, channelId) {
  const channel = await queryOne('SELECT id FROM channels WHERE id = $1', [channelId]);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  await query(
    `INSERT INTO channel_subscriptions (user_id, channel_id) VALUES ($1, $2)
     ON CONFLICT (channel_id, user_id) DO NOTHING`,
    [userId, channelId]
  );

  await query(
    'UPDATE channels SET subscriber_count = subscriber_count + 1 WHERE id = $1',
    [channelId]
  );
  return { isSubscribed: true };
}

/**
 * Unsubscribe from a channel (idempotent).
 */
export async function unsubscribeFromChannel(userId, channelId) {
  const result = await query(
    'DELETE FROM channel_subscriptions WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId]
  );

  if (result.rowCount > 0) {
    await query(
      'UPDATE channels SET subscriber_count = GREATEST(subscriber_count - 1, 0) WHERE id = $1',
      [channelId]
    );
  }
  return { isSubscribed: false };
}

/**
 * Get posts belonging to a channel, newest first, cursor paginated.
 */
export async function getChannelPosts(channelId, limit = 20, beforeId = null) {
  return queryAll(
    `SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM posts p
     JOIN users u ON p.author_id = u.id
     WHERE p.channel_id = $1 AND p.deleted_at IS NULL AND u.is_banned = false
       AND ($2::int IS NULL OR p.id < $2)
     ORDER BY p.id DESC
     LIMIT $3`,
    [channelId, beforeId, limit]
  );
}

/**
 * List a channel's subscribers.
 */
export async function getChannelSubscribers(channelId, limit = 20, offset = 0) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM channel_subscriptions cs
     JOIN users u ON u.id = cs.user_id
     WHERE cs.channel_id = $1 AND u.is_banned = false
     ORDER BY cs.created_at DESC
     LIMIT $2 OFFSET $3`,
    [channelId, limit, offset]
  );
}

export default {
  createChannel,
  getChannels,
  getChannelById,
  updateChannel,
  deleteChannel,
  subscribeToChannel,
  unsubscribeFromChannel,
  getChannelPosts,
  getChannelSubscribers
};