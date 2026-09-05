import { queryAll, queryOne } from '../config/database.js';

/**
 * Get personalized feed (for_you)
 */
export async function getForYouFeed(userId, limit = 20, beforeId = null) {
  let query = `
    SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND followee_id = p.author_id) AS is_following
    FROM posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.deleted_at IS NULL
    AND p.scheduled_at IS NULL
    AND u.is_banned = false
    ${beforeId ? 'AND p.id < $2' : ''}
    ORDER BY p.created_at DESC
    LIMIT $${beforeId ? '3' : '2'}
  `;

  const params = beforeId ? [userId, beforeId, limit] : [userId, limit];
  return queryAll(query, params);
}

/**
 * Get following feed
 */
export async function getFollowingFeed(userId, limit = 20, beforeId = null) {
  let query = `
    SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON p.author_id = u.id
    JOIN follows f ON p.author_id = f.followee_id
    WHERE f.follower_id = $1
    AND p.deleted_at IS NULL
    AND p.scheduled_at IS NULL
    AND u.is_banned = false
    ${beforeId ? 'AND p.id < $2' : ''}
    ORDER BY p.created_at DESC
    LIMIT $${beforeId ? '3' : '2'}
  `;

  const params = beforeId ? [userId, beforeId, limit] : [userId, limit];
  return queryAll(query, params);
}

/**
 * Get channel feed
 */
export async function getChannelFeed(channelId, limit = 20, beforeId = null) {
  let query = `
    SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.channel_id = $1
    AND p.deleted_at IS NULL
    AND p.scheduled_at IS NULL
    AND u.is_banned = false
    ${beforeId ? 'AND p.id < $2' : ''}
    ORDER BY p.created_at DESC
    LIMIT $${beforeId ? '3' : '2'}
  `;

  const params = beforeId ? [channelId, beforeId, limit] : [channelId, limit];
  return queryAll(query, params);
}

/**
 * Get trending posts
 */
export async function getTrendingPosts(limit = 20) {
  return queryAll(
    `SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
            (p.like_count + p.comment_count * 2 + p.repost_count * 2 + p.view_count) AS engagement_score
     FROM posts p
     JOIN users u ON p.author_id = u.id
     WHERE p.deleted_at IS NULL
     AND p.created_at > NOW() - INTERVAL '7 days'
     AND u.is_banned = false
     ORDER BY engagement_score DESC
     LIMIT $1`,
    [limit]
  );
}

/**
 * Get feed by hashtag
 */
export async function getHashtagFeed(tag, limit = 20, beforeId = null) {
  let query = `
    SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON p.author_id = u.id
    JOIN post_hashtags ph ON p.id = ph.post_id
    WHERE ph.tag = $1
    AND p.deleted_at IS NULL
    AND u.is_banned = false
    ${beforeId ? 'AND p.id < $2' : ''}
    ORDER BY p.created_at DESC
    LIMIT $${beforeId ? '3' : '2'}
  `;

  const params = beforeId ? [tag, beforeId, limit] : [tag, limit];
  return queryAll(query, params);
}

/**
 * Get user's feed (profile posts)
 */
export async function getUserFeed(userId, viewerId = null, limit = 20, beforeId = null) {
  let query = `
    SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.author_id = $1
    AND p.deleted_at IS NULL
    AND p.scheduled_at IS NULL
    AND u.is_banned = false
    ${beforeId ? 'AND p.id < $2' : ''}
    ORDER BY p.created_at DESC
    LIMIT $${beforeId ? '3' : '2'}
  `;

  const params = beforeId ? [userId, beforeId, limit] : [userId, limit];
  return queryAll(query, params);
}

/**
 * Get trending hashtags (top by post_count).
 * When `q` is provided, only tags starting with that prefix are returned
 * (used for the search overlay autocomplete — parity with legacy /api/hashtags).
 */
export async function getTrendingHashtags(q = null, limit = 10) {
  if (q) {
    return queryAll(
      `SELECT tag, post_count FROM hashtags
       WHERE tag ILIKE $1
       ORDER BY post_count DESC
       LIMIT $2`,
      [`${q}%`, limit]
    );
  }
  return queryAll(
    `SELECT tag, post_count FROM hashtags
     ORDER BY post_count DESC
     LIMIT $1`,
    [limit]
  );
}

/**
 * Get top verified users (blue/gold/grey badges) for the search overlay.
 */
export async function getTopVerifiedUsers(limit = 10) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge,
            (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers
     FROM users u
     WHERE u.verified_badge != ''
       AND u.is_banned = false
     ORDER BY (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) DESC, u.created_at ASC
     LIMIT $1`,
    [limit]
  );
}

/**
 * Get users the current user follows who are currently hosting a live room,
 * plus the room summary (parity with legacy /api/live-users).
 */
export async function getLiveUsers(userId, limit = 10) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge,
            r.id AS room_id, r.title AS room_title, r.kind AS room_kind,
            r.current_viewers, r.status
     FROM rooms r
     JOIN users u ON r.host_id = u.id
     JOIN follows f ON f.followee_id = u.id
     WHERE f.follower_id = $1
       AND r.status = 'live'
       AND u.is_banned = false
     ORDER BY r.current_viewers DESC
     LIMIT $2`,
    [userId, limit]
  );
}

/**
 * Record post view
 */
export async function recordPostView(postId, userId = null) {
  // Simple view tracking - increment view count
  // For detailed analytics, you'd want a separate views table
  const result = await queryOne(
    'UPDATE posts SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count',
    [postId]
  );
  return result;
}

export default {
  getForYouFeed,
  getFollowingFeed,
  getChannelFeed,
  getTrendingPosts,
  getHashtagFeed,
  getUserFeed,
  getTrendingHashtags,
  getTopVerifiedUsers,
  getLiveUsers,
  recordPostView
};
