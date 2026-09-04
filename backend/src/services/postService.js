import sanitizeHtml from 'sanitize-html';
import { query, queryOne, queryAll, transaction } from '../config/database.js';

/**
 * Create a post
 */
export async function createPost(authorId, data) {
  const { kind = 'text', body = '', title = '', channelId = null, isExclusive = false, unlockPrice = 0, scheduledAt = null,
          mediaUrl = '', mediaKey = '', mediaType = '' } = data;

  // Sanitize content
  const cleanBody = sanitizeHtml(body);
  const cleanTitle = sanitizeHtml(title);

  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO posts (author_id, kind, body, title, channel_id, is_exclusive, unlock_price, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, author_id, kind, body, title, created_at`,
      [authorId, kind, cleanBody, cleanTitle, channelId, isExclusive, unlockPrice, scheduledAt]
    );
    const post = result.rows[0];

    // Attach media if provided
    if (mediaUrl) {
      const mediaKind = mediaType || (kind === 'video' ? 'video' : 'image');
      await client.query(
        `INSERT INTO media (post_id, owner_id, key, url, mime, kind)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [post.id, authorId, mediaKey, mediaUrl, '', mediaKind]
      );
    }

    return post;
  });
}

/**
 * Get post by ID
 */
export async function getPostById(postId, viewerId = null) {
  const post = await queryOne(
    `SELECT p.*, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM posts p
     JOIN users u ON p.author_id = u.id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [postId]
  );

  if (!post) return null;

  // Get media
  const media = await queryAll(
    'SELECT id, key, url, mime, kind FROM media WHERE post_id = $1',
    [postId]
  );

  // Get comments
  const comments = await queryAll(
    `SELECT c.*, u.username, u.display_name, u.avatar_url
     FROM comments c
     JOIN users u ON c.author_id = u.id
     WHERE c.post_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    [postId]
  );

  // Check if viewer liked it
  let liked = false;
  if (viewerId) {
    const like = await queryOne(
      'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2',
      [postId, viewerId]
    );
    liked = !!like;
  }

  return {
    ...post,
    media,
    comments,
    liked
  };
}

/**
 * Update post
 */
export async function updatePost(postId, authorId, updates) {
  const post = await queryOne('SELECT author_id FROM posts WHERE id = $1', [postId]);
  
  if (!post || post.author_id !== authorId) {
    throw new Error('Unauthorized');
  }

  const { body, title } = updates;
  
  return queryOne(
    `UPDATE posts SET body = COALESCE($1, body), title = COALESCE($2, title), updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [sanitizeHtml(body), sanitizeHtml(title), postId]
  );
}

/**
 * Delete post
 */
export async function deletePost(postId, authorId) {
  const post = await queryOne('SELECT author_id FROM posts WHERE id = $1', [postId]);
  
  if (!post || post.author_id !== authorId) {
    throw new Error('Unauthorized');
  }

  await query(
    'UPDATE posts SET deleted_at = NOW() WHERE id = $1',
    [postId]
  );
}

/**
 * Like a post
 */
export async function likePost(postId, userId) {
  try {
    await query(
      'INSERT INTO likes (post_id, user_id) VALUES ($1, $2)',
      [postId, userId]
    );
    
    // Increment like count
    await query('UPDATE posts SET like_count = like_count + 1 WHERE id = $1', [postId]);
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Already liked this post');
    }
    throw error;
  }
}

/**
 * Unlike a post
 */
export async function unlikePost(postId, userId) {
  await query(
    'DELETE FROM likes WHERE post_id = $1 AND user_id = $2',
    [postId, userId]
  );
  
  // Decrement like count
  await query('UPDATE posts SET like_count = like_count - 1 WHERE id = $1', [postId]);
}

/**
 * Comment on a post
 */
export async function commentOnPost(postId, authorId, body) {
  const cleanBody = sanitizeHtml(body);

  const result = await query(
    `INSERT INTO comments (post_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, author_id, body, created_at`,
    [postId, authorId, cleanBody]
  );

  // Increment comment count
  await query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);

  return result.rows[0];
}

/**
 * Get comments on post
 */
export async function getPostComments(postId, limit = 50, offset = 0) {
  return queryAll(
    `SELECT c.*, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM comments c
     JOIN users u ON c.author_id = u.id
     WHERE c.post_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [postId, limit, offset]
  );
}

/**
 * Like a comment
 */
export async function likeComment(commentId, userId) {
  try {
    await query(
      'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)',
      [commentId, userId]
    );
    
    // Increment like count
    await query('UPDATE comments SET like_count = like_count + 1 WHERE id = $1', [commentId]);
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Already liked this comment');
    }
    throw error;
  }
}

/**
 * Unlike a comment
 */
export async function unlikeComment(commentId, userId) {
  await query(
    'DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2',
    [commentId, userId]
  );
  
  // Decrement like count
  await query('UPDATE comments SET like_count = like_count - 1 WHERE id = $1', [commentId]);
}

/**
 * Repost (share) a post
 */
export async function repostPost(originalPostId, authorId) {
  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO posts (author_id, kind, repost_of)
       VALUES ($1, 'text', $2)
       RETURNING *`,
      [authorId, originalPostId]
    );

    const post = result.rows[0];

    // Increment repost count
    await client.query('UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1', [originalPostId]);

    return post;
  });
}

/**
 * Quote a post
 */
export async function quotePost(originalPostId, authorId, body) {
  return transaction(async (client) => {
    const cleanBody = sanitizeHtml(body);

    const result = await client.query(
      `INSERT INTO posts (author_id, kind, body, quote_of)
       VALUES ($1, 'text', $2, $3)
       RETURNING *`,
      [authorId, cleanBody, originalPostId]
    );

    const post = result.rows[0];

    // Increment quote count
    await client.query('UPDATE posts SET quote_count = quote_count + 1 WHERE id = $1', [originalPostId]);

    return post;
  });
}

export default {
  createPost,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  commentOnPost,
  getPostComments,
  likeComment,
  unlikeComment,
  repostPost,
  quotePost
};
