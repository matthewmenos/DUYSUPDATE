import { query, queryOne, queryAll } from '../config/database.js';

/**
 * Get user by ID
 */
export async function getUserById(userId) {
  const user = await queryOne(
    `SELECT id, email, username, display_name, bio, location, website, 
            avatar_url, banner_url, points, duys_tokens, verified_badge, 
            verified_badge_expires, is_admin, theme, last_seen, profile_slug, 
            pinned_post_id, created_at
     FROM users WHERE id = $1 AND is_banned = false`,
    [userId]
  );
  
  if (!user) return null;
  
  // Get follower/following counts
  const followers = await queryOne(
    'SELECT COUNT(*) as count FROM follows WHERE followee_id = $1',
    [userId]
  );
  
  const following = await queryOne(
    'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
    [userId]
  );
  
  return {
    ...user,
    followers_count: parseInt(followers.count),
    following_count: parseInt(following.count)
  };
}

/**
 * Get user by username
 */
export async function getUserByUsername(username) {
  return getUserById(
    (await queryOne('SELECT id FROM users WHERE username = $1', [username]))?.id
  );
}

/**
 * Get user profile (public view)
 */
export async function getUserProfile(userId, currentUserId = null) {
  const user = await getUserById(userId);
  if (!user) return null;
  
  // Check if current user follows
  let isFollowing = false;
  let isFollowed = false;
  
  if (currentUserId && currentUserId !== userId) {
    const follow = await queryOne(
      'SELECT id FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [currentUserId, userId]
    );
    isFollowing = !!follow;
    
    const followedBy = await queryOne(
      'SELECT id FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [userId, currentUserId]
    );
    isFollowed = !!followedBy;
  }
  
  return {
    ...user,
    isFollowing,
    isFollowed
  };
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, updates) {
  const allowedFields = ['display_name', 'bio', 'location', 'website', 'avatar_url', 'banner_url', 'theme', 'profile_slug', 'is_private', 'who_can_message', 'show_online_status'];
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }
  
  if (fields.length === 0) return null;
  
  values.push(userId);
  
  return queryOne(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
}

/**
 * Follow user
 */
export async function followUser(followerId, followeeId) {
  if (followerId === followeeId) {
    throw new Error('Cannot follow yourself');
  }
  
  try {
    await query(
      'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)',
      [followerId, followeeId]
    );
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Already following this user');
    }
    throw error;
  }
  
  // Increment subscriber count
  await query('UPDATE users SET followers_count = followers_count + 1 WHERE id = $1', [followeeId]);
}

/**
 * Unfollow user
 */
export async function unfollowUser(followerId, followeeId) {
  await query(
    'DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2',
    [followerId, followeeId]
  );
  
  // Decrement subscriber count
  await query('UPDATE users SET followers_count = followers_count - 1 WHERE id = $1', [followeeId]);
}

/**
 * Get user followers
 */
export async function getUserFollowers(userId, limit = 20, offset = 0) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM follows f
     JOIN users u ON f.follower_id = u.id
     WHERE f.followee_id = $1 AND u.is_banned = false
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
}

/**
 * Get user following
 */
export async function getUserFollowing(userId, limit = 20, offset = 0) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM follows f
     JOIN users u ON f.followee_id = u.id
     WHERE f.follower_id = $1 AND u.is_banned = false
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
}

/**
 * Search users
 */
export async function searchUsers(query_string, limit = 20) {
  return queryAll(
    `SELECT id, username, display_name, avatar_url, verified_badge,
            (SELECT COUNT(*) FROM follows WHERE followee_id = users.id) AS followers
     FROM users
     WHERE (username ILIKE $1 OR display_name ILIKE $1) AND is_banned = false
     ORDER BY followers DESC
     LIMIT $2`,
    [`%${query_string}%`, limit]
  );
}

/**
 * Get suggestions (who to follow)
 */
export async function getFollowSuggestions(userId, limit = 10) {
  return queryAll(
    `SELECT id, username, display_name, avatar_url, verified_badge,
            (SELECT COUNT(*) FROM follows WHERE followee_id = users.id) AS followers
     FROM users
     WHERE id != $1
     AND id NOT IN (SELECT followee_id FROM follows WHERE follower_id = $1)
     AND is_banned = false
     ORDER BY verified_badge DESC, followers DESC, points DESC
     LIMIT $2`,
    [userId, limit]
  );
}

// ============================================================================
// Settings: password, privacy, notifications, blocked users, export, delete
// ============================================================================

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('User not found');
  const isValid = await comparePassword(currentPassword, user.password_hash);
  if (!isValid) throw new Error('Current password is incorrect');
  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
}

export async function updateNotificationPreferences(userId, prefs) {
  await query('UPDATE users SET push_notifications = push_notifications || $1::jsonb WHERE id = $2', [JSON.stringify(prefs), userId]);
}

export async function getNotificationPreferences(userId) {
  const row = await queryOne('SELECT push_notifications FROM users WHERE id = $1', [userId]);
  const defaults = { likes: true, comments: true, follows: true, mentions: true, messages: true, reposts: true };
  return { ...defaults, ...(row?.push_notifications || {}) };
}

export async function getBlockedUsers(userId) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM blocked_users b JOIN users u ON b.blocked_id = u.id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [userId]
  );
}

export async function blockUser(blockerId, blockedId) {
  await query(
    'INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [blockerId, blockedId]
  );
  // Remove any follow relationship in both directions
  await query('DELETE FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)', [blockerId, blockedId]);
}

export async function unblockUser(blockerId, blockedId) {
  await query('DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
}

export async function requestDataExport(userId) {
  const result = await query(
    `INSERT INTO data_exports (user_id) VALUES ($1) RETURNING id, status, created_at`,
    [userId]
  );
  return { message: 'Data export requested. You will be notified when it is ready.', ...result.rows[0] };
}

export async function deleteAccount(userId, password) {
  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('User not found');
  const isValid = await comparePassword(password, user.password_hash);
  if (!isValid) throw new Error('Password is incorrect');
  // Soft-delete: anonymize the account rather than hard-destroying references
  await query(
    `UPDATE users SET
      email = 'deleted_' || id || '@deleted.local',
      username = 'deleted_' || id,
      display_name = 'Deleted User',
      password_hash = '',
      bio = '', avatar_url = '', banner_url = '', is_banned = true,
      updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
  await query('DELETE FROM follows WHERE follower_id = $1 OR followee_id = $1', [userId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export default {
  getUserById,
  getUserByUsername,
  getUserProfile,
  updateUserProfile,
  followUser,
  unfollowUser,
  getUserFollowers,
  getUserFollowing,
  searchUsers,
  getFollowSuggestions,
  changePassword,
  updateNotificationPreferences,
  getNotificationPreferences,
  getBlockedUsers,
  blockUser,
  unblockUser,
  requestDataExport,
  deleteAccount
};
