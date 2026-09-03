import { query, queryOne, queryAll } from '../config/database.js';
import { deletePublic } from './storage.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Stories service — 24h ephemeral content.
 * Stories are soft-deleted by expiring them (expires_at <= NOW()), which
 * removes them from every feed/detail query while retaining the row.
 */

const ALLOWED_REACTIONS = ['😂', '😢', '😍', '🔥', '👍', '👏', '👀', '😮'];

/**
 * Create a story, expiring 24 hours from now.
 */
export async function createStory(userId, { mediaUrl, caption = '', mediaKey = '', mediaKind = 'image' }) {
  const result = await query(
    `INSERT INTO stories (author_id, media_key, media_url, media_kind, caption, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 day')
     RETURNING id, author_id, media_key, media_url, media_kind, caption, created_at, expires_at`,
    [userId, mediaKey, mediaUrl, mediaKind, caption]
  );

  return result.rows[0];
}

/**
 * Get a feed of active (not expired) stories from followed users plus the
 * viewer's own stories. Flat list, newest first, cursor paginated.
 */
export async function getStoriesFeed(userId, limit = 30, offset = 0) {
  return queryAll(
    `SELECT s.*,
            u.username, u.display_name, u.avatar_url, u.verified_badge,
            (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id) AS view_count,
            (EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = $1)) AS is_viewed,
            (SELECT emoji FROM story_reactions r WHERE r.story_id = s.id AND r.user_id = $1) AS my_reaction
     FROM stories s
     JOIN users u ON s.author_id = u.id
     WHERE s.expires_at > NOW()
       AND u.is_banned = false
       AND (s.author_id = $1
            OR EXISTS (SELECT 1 FROM follows f
                       WHERE f.follower_id = $1 AND f.followee_id = s.author_id))
     ORDER BY s.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
}
/**
 * Get a single visible story with the viewer's context (isViewed / myReaction).
 */
export async function getStoryById(storyId, viewerId) {
  const story = await queryOne(
    `SELECT s.*,
            u.username, u.display_name, u.avatar_url, u.verified_badge,
            (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id) AS view_count,
            (EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = $2)) AS is_viewed,
            (SELECT emoji FROM story_reactions r WHERE r.story_id = s.id AND r.user_id = $2) AS my_reaction
     FROM stories s
     JOIN users u ON s.author_id = u.id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_banned = false`,
    [storyId, viewerId]
  );

  if (!story) return null;
  return story;
}

/**
 * Soft-delete a story (expire it immediately) and remove its R2 file.
 * Only the author may delete.
 */
export async function deleteStory(storyId, userId) {
  const story = await queryOne('SELECT * FROM stories WHERE id = $1', [storyId]);

  if (!story) {
    throw new AppError('Story not found', 404);
  }
  if (story.author_id !== parseInt(userId, 10)) {
    throw new AppError('Unauthorized to delete this story', 403);
  }

  // Soft delete = expire immediately so it disappears from all queries.
  await query('UPDATE stories SET expires_at = NOW() WHERE id = $1', [storyId]);

  // Best-effort removal of the underlying S3/R2 object.
  if (story.media_key) {
    try {
      await deletePublic(story.media_key);
    } catch (error) {
      console.error('[Story Delete R2]', error);
    }
  }

  return { message: 'Story deleted successfully' };
}

/**
 * Record a story view (idempotent per user). Returns the new total view count.
 */
export async function recordStoryView(storyId, userId) {
  const existing = await queryOne(
    'SELECT id FROM stories WHERE id = $1 AND expires_at > NOW()',
    [storyId]
  );
  if (!existing) {
    throw new AppError('Story not found or expired', 404);
  }

  await query(
    `INSERT INTO story_views (story_id, user_id) VALUES ($1, $2)
     ON CONFLICT (story_id, user_id) DO NOTHING`,
    [storyId, userId]
  );

  const count = await queryOne(
    'SELECT COUNT(*) AS count FROM story_views WHERE story_id = $1',
    [storyId]
  );

  return { viewCount: parseInt(count.count, 10) };
}

/**
 * Add or update the current user's reaction (upsert on unique story_id + user_id).
 */
export async function reactToStory(storyId, userId, emoji) {
  if (!ALLOWED_REACTIONS.includes(emoji)) {
    throw new AppError('Invalid reaction', 400);
  }

  const existing = await queryOne(
    'SELECT id FROM stories WHERE id = $1 AND expires_at > NOW()',
    [storyId]
  );
  if (!existing) {
    throw new AppError('Story not found or expired', 404);
  }

  await query(
    `INSERT INTO story_reactions (story_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (story_id, user_id)
     DO UPDATE SET emoji = $3, created_at = NOW()`,
    [storyId, userId, emoji]
  );

  return getStoryReactions(storyId, userId);
}

/**
 * Remove the current user's reaction from a story.
 */
export async function removeStoryReaction(storyId, userId) {
  await query(
    'DELETE FROM story_reactions WHERE story_id = $1 AND user_id = $2',
    [storyId, userId]
  );
  return getStoryReactions(storyId, userId);
}

/**
 * Get aggregated reaction counts, optionally tagged with the viewer's reaction.
 */
export async function getStoryReactions(storyId, viewerId = null) {
  const rows = await queryAll(
    `SELECT emoji, COUNT(*) AS count
     FROM story_reactions
     WHERE story_id = $1
     GROUP BY emoji
     ORDER BY count DESC`,
    [storyId]
  );

  let myReaction = null;
  if (viewerId) {
    const mine = await queryOne(
      'SELECT emoji FROM story_reactions WHERE story_id = $1 AND user_id = $2',
      [storyId, viewerId]
    );
    myReaction = mine ? mine.emoji : null;
  }

  return { reactions: rows, myReaction, allowed: ALLOWED_REACTIONS };
}

export default {
  createStory,
  getStoriesFeed,
  getStoryById,
  deleteStory,
  recordStoryView,
  reactToStory,
  removeStoryReaction,
  getStoryReactions,
  ALLOWED_REACTIONS,
};