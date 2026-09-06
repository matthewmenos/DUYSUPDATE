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

// ============================================================================
// Channel mute
// ============================================================================
export async function muteChannel(userId, channelId) {
  await query(
    'INSERT INTO channel_mutes (user_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, channelId]
  );
  return { muted: true };
}

export async function unmuteChannel(userId, channelId) {
  await query('DELETE FROM channel_mutes WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId]);
  return { muted: false };
}

export async function isChannelMuted(userId, channelId) {
  const row = await queryOne(
    'SELECT 1 FROM channel_mutes WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId]
  );
  return !!row;
}

// ============================================================================
// Channel broadcast
// ============================================================================
export async function broadcastToChannel(channelId, authorId, { body, title = '' }) {
  const channel = await queryOne('SELECT id, owner_id, name FROM channels WHERE id = $1', [channelId]);
  if (!channel) throw new AppError('Channel not found', 404);
  if (channel.owner_id !== parseInt(authorId, 10)) {
    throw new AppError('Only the owner can broadcast', 403);
  }

  const result = await query(
    `INSERT INTO posts (author_id, kind, body, title, channel_id, is_sponsored)
     VALUES ($1, 'text', $2, $3, $4, true)
     RETURNING *`,
        [authorId, body, title, channelId]
  );
  return result.rows[0];
}

// ============================================================================
// Channel verification
// ============================================================================

export async function selfVerifyChannel(channelId, userId) {
  const channel = await queryOne(
    'SELECT id, owner_id, verified_badge FROM channels WHERE id = $1',
    [channelId]
  );
  if (!channel) throw new AppError('Channel not found', 404);
  if (channel.owner_id !== parseInt(userId, 10)) {
    throw new AppError('Only the owner can self-verify', 403);
  }

  const user = await queryOne('SELECT verified_badge FROM users WHERE id = $1', [userId]);
  if (!user?.verified_badge) throw new AppError('not_verified', 403);
  if (user.self_verified_channel_id && user.self_verified_channel_id !== channelId) {
    throw new AppError('slot_used', 400);
  }

  await query(
    `UPDATE channels SET verified_badge = $1, verification_status = 'approved', self_verified = true
     WHERE id = $2`,
    [user.verified_badge, channelId]
  );
  await query('UPDATE users SET self_verified_channel_id = $1 WHERE id = $2', [channelId, userId]);
  return { verified: true };
}

export async function unselfVerifyChannel(channelId, userId) {
  const channel = await queryOne('SELECT id, owner_id FROM channels WHERE id = $1', [channelId]);
  if (!channel) throw new AppError('Channel not found', 404);
  if (channel.owner_id !== parseInt(userId, 10)) throw new AppError('Only the owner can do this', 403);

  await query(
    "UPDATE channels SET verified_badge = '', verification_status = 'none', self_verified = false WHERE id = $1",
    [channelId]
  );
  await query(
    'UPDATE users SET self_verified_channel_id = NULL WHERE id = $1 AND self_verified_channel_id = $2',
    [userId, channelId]
  );
  return { verified: false };
}

export async function applyChannelVerification(channelId, userId, { message = '' }) {
  const channel = await queryOne(
    'SELECT id, owner_id, verified_badge FROM channels WHERE id = $1',
    [channelId]
  );
  if (!channel) throw new AppError('Channel not found', 404);
  if (channel.owner_id !== parseInt(userId, 10)) throw new AppError('Only the owner can apply', 403);
  if (channel.verified_badge) throw new AppError('already_verified', 400);

  const existing = await queryOne(
    'SELECT id FROM channel_verifications WHERE channel_id = $1 AND status = \'pending\'',
    [channelId]
  );
  if (existing) throw new AppError('already_pending', 400);

  await query(
    'INSERT INTO channel_verifications (channel_id, user_id, reason) VALUES ($1, $2, $3)',
    [channelId, userId, message]
  );
  await query("UPDATE channels SET verification_status = 'pending' WHERE id = $1", [channelId]);
  return { applied: true };
}

export async function getChannelVerifications(status = 'pending', limit = 50, offset = 0) {
  return queryAll(
    `SELECT cv.*, c.name AS channel_name, c.handle, u.username, u.display_name, u.avatar_url
     FROM channel_verifications cv
     JOIN channels c ON cv.channel_id = c.id
     JOIN users u ON cv.user_id = u.id
     WHERE cv.status = $1
     ORDER BY cv.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );
}

export async function reviewChannelVerification(verificationId, adminId, { status, badge = 'blue' }) {
  const verification = await queryOne(
    'SELECT id, channel_id FROM channel_verifications WHERE id = $1',
    [verificationId]
  );
  if (!verification) throw new AppError('Verification application not found', 404);

  if (status === 'approved') {
    await query(
      `UPDATE channels SET verified_badge = $1, verification_status = 'approved' WHERE id = $2`,
      [badge, verification.channel_id]
    );
  } else {
    await query("UPDATE channels SET verification_status = 'rejected' WHERE id = $1",
      [verification.channel_id]);
  }

  await query(
    `UPDATE channel_verifications SET status = $1, decided_by = $2, updated_at = NOW() WHERE id = $3`,
    [status, adminId, verificationId]
  );
  return { reviewed: true };
}

export default {
  // Existing
  createChannel,
  getChannels,
  getChannelById,
  updateChannel,
  deleteChannel,
  subscribeToChannel,
  unsubscribeFromChannel,
  getChannelPosts,
  getChannelSubscribers,
  // Channel depth
  muteChannel,
  unmuteChannel,
  isChannelMuted,
  broadcastToChannel,
  selfVerifyChannel,
  unselfVerifyChannel,
  applyChannelVerification,
  getChannelVerifications,
  reviewChannelVerification
};