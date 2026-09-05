import sanitizeHtml from 'sanitize-html';
import { query, queryOne, queryAll, transaction } from '../config/database.js';
import * as textService from './textService.js';
import * as linkPreviewService from './linkPreviewService.js';
import * as notificationsService from './notificationsService.js';

/**
 * Create a post (text / image / video / poll / article).
 * Auto-indexes #hashtags, notifies @mentioned users, and starts a
 * fire-and-forget OG link-preview fetch for the first URL in the body.
 */
export async function createPost(authorId, data) {
  const {
    kind = 'text', body = '', title = '', channelId = null, isExclusive = false,
    unlockPrice = 0, scheduledAt = null, mediaUrl = '', mediaKey = '', mediaType = '',
    pollOptions = []
  } = data;

  const rich = kind === 'article';
  const cleanBody = rich
    ? sanitizeHtml(body, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'p', 'img', 'a', 'blockquote', 'figure', 'figcaption', 'iframe']),
        allowedAttributes: {
          a: ['href', 'name', 'target', 'rel'],
          img: ['src', 'alt', 'width', 'height', 'class'],
          iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow'],
          '*': ['class']
        },
        allowedSchemes: ['http', 'https', 'mailto', 'data']
      })
    : sanitizeHtml(body);
  const cleanTitle = sanitizeHtml(title);

  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO posts (author_id, kind, body, title, channel_id, is_exclusive, unlock_price, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, author_id, kind, body, title, created_at, scheduled_at`,
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

    // Poll options
    if (kind === 'poll' && Array.isArray(pollOptions)) {
      for (const rawLabel of pollOptions) {
        const label = sanitizeHtml(String(rawLabel || '').trim()).slice(0, 500);
        if (label) {
          await client.query(
            'INSERT INTO poll_options (post_id, label) VALUES ($1, $2)',
            [post.id, label]
          );
        }
      }
    }

    // Index hashtags + store link preview seeded row (title/fields filled async)
    const tags = textService.extractHashtags(cleanBody);
    for (const tag of tags) {
      await client.query(
        `INSERT INTO hashtags (tag, post_count, last_used)
         VALUES ($1, 1, NOW())
         ON CONFLICT (tag) DO UPDATE SET post_count = hashtags.post_count + 1, last_used = NOW()`,
        [tag]
      );
      await client.query(
        'INSERT INTO post_hashtags (post_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [post.id, tag]
      );
    }

    return post;
  });
}

/**
 * Fire-and-forget: fetch the OG preview for the first URL in `body` and
 * upsert it into link_previews. Never blocks or throws to the caller.
 */
export function queueLinkPreview(postId, body) {
  const url = linkPreviewService.firstUrl(body);
  if (!url) return;
  (async () => {
    try {
      const preview = await linkPreviewService.fetch(url);
      if (!preview) return;
      await query(
        `INSERT INTO link_previews (post_id, url, title, description, image, domain)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (post_id) DO UPDATE SET
           url = EXCLUDED.url, title = EXCLUDED.title, description = EXCLUDED.description,
           image = EXCLUDED.image, domain = EXCLUDED.domain`,
        [postId, preview.url, preview.title, preview.description, preview.image, preview.domain]
      );
    } catch (err) {
      console.error('[link-preview]', err.message);
    }
  })();
}

/**
 * Notify every @mentioned user (except the author) about a new post.
 * Best-effort — a failed notification never breaks posting.
 */
export async function notifyMentions(postId, authorId, body) {
  try {
    const usernames = textService.extractMentions(body || '');
    for (const username of usernames) {
      const target = await queryOne('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
      if (target && target.id !== authorId) {
        await notificationsService.notifyMentioned(postId, target.id, authorId);
      }
    }
  } catch (err) {
    console.error('[notify-mentions]', err.message);
  }
}

/**
 * Hydrate a raw post row with viewer-scoped extras:
 * media, poll options + my vote, link preview, liked, unlocked, is_pinned.
 */
export async function hydratePostRow(row, viewerId = null) {
  if (!row) return null;
  const post = { ...row };
  const pid = post.id;

  const [media, pollOptions, linkPreview] = await Promise.all([
    queryAll('SELECT id, key, url, mime, kind, width, height, duration FROM media WHERE post_id = $1', [pid]),
    post.kind === 'poll'
      ? queryAll('SELECT id, label, votes FROM poll_options WHERE post_id = $1 ORDER BY id', [pid])
      : Promise.resolve([]),
    queryOne('SELECT * FROM link_previews WHERE post_id = $1', [pid])
  ]);
  post.media = media;
  post.poll_options = pollOptions;
  post.link_preview = linkPreview || null;

  let myVote = null;
  let unlocked = false;
  let liked = false;
  if (viewerId) {
    if (pollOptions.length) {
      const v = await queryOne('SELECT option_id FROM poll_votes WHERE post_id = $1 AND user_id = $2', [pid, viewerId]);
      myVote = v ? v.option_id : null;
    }
    if (post.is_exclusive) {
      const u = await queryOne('SELECT 1 FROM post_unlocks WHERE post_id = $1 AND user_id = $2', [pid, viewerId]);
      unlocked = !!u;
    } else {
      unlocked = true;
    }
    const l = await queryOne('SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2', [pid, viewerId]);
    liked = !!l;
  } else {
    unlocked = !post.is_exclusive;
  }

  post.my_vote = myVote;
  post.unlocked = unlocked;
  post.liked = liked || !!post.liked;
  return post;
}

/**
 * Hydrate a list of raw post rows (feed paths).
 */
export async function hydratePosts(rows, viewerId = null) {
  if (!rows || !rows.length) return [];
  return Promise.all(rows.map((r) => hydratePostRow(r, viewerId)));
}

/**
 * Get post by ID with full hydration.
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

  const hydrated = await hydratePostRow(post, viewerId);

  // Get comments
  const comments = await queryAll(
    `SELECT c.*, u.username, u.display_name, u.avatar_url
     FROM comments c
     JOIN users u ON c.author_id = u.id
     WHERE c.post_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    [postId]
  );

  return { ...hydrated, comments };
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

/**
 * Vote on a post poll. One vote per (post, user); re-voting is not allowed.
 * Returns the refreshed poll state.
 */
export async function votePoll(postId, userId, optionId) {
  const option = await queryOne(
    'SELECT id, post_id FROM poll_options WHERE id = $1 AND post_id = $2',
    [optionId, postId]
  );
  if (!option) throw new Error('Poll option not found');

  const existing = await queryOne(
    'SELECT option_id FROM poll_votes WHERE post_id = $1 AND user_id = $2',
    [postId, userId]
  );
  if (existing) throw new Error('You already voted on this poll');

  await transaction(async (client) => {
    await client.query(
      'INSERT INTO poll_votes (post_id, user_id, option_id) VALUES ($1, $2, $3)',
      [postId, userId, optionId]
    );
    await client.query('UPDATE poll_options SET votes = votes + 1 WHERE id = $1', [optionId]);
  });

  return queryAll(
    'SELECT id, label, votes FROM poll_options WHERE post_id = $1 ORDER BY id',
    [postId]
  );
}

/**
 * Pay DUYS tokens to unlock an exclusive post.
 * Deducts from the viewer's balance and credits the author, then records
 * the unlock and financial transactions.
 */
export async function unlockPost(postId, userId) {
  return transaction(async (client) => {
    const post = await client.query(
      'SELECT id, author_id, is_exclusive, unlock_price FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [postId]
    );
    const row = post.rows[0];
    if (!row) throw new Error('Post not found');
    if (!row.is_exclusive) throw new Error('This post is not exclusive');

    if (row.author_id === userId) {
      // Author sees their own exclusive content for free.
      await client.query(
        'INSERT INTO post_unlocks (user_id, post_id, paid) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING',
        [userId, postId]
      );
      return { unlocked: true };
    }

    const existing = await client.query(
      'SELECT 1 FROM post_unlocks WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );
    if (existing.rows[0]) return { unlocked: true }; // already unlocked

    const price = Number(row.unlock_price || 0);

    if (price > 0) {
      const viewer = await client.query(
        'SELECT duys_tokens FROM users WHERE id = $1',
        [userId]
      );
      const balance = Number(viewer.rows[0]?.duys_tokens || 0);
      if (balance < price) throw new Error('Insufficient DUYS balance');

      await client.query(
        'UPDATE users SET duys_tokens = duys_tokens - $1 WHERE id = $2',
        [price, userId]
      );
      await client.query(
        'UPDATE users SET duys_tokens = duys_tokens + $1 WHERE id = $2',
        [price, row.author_id]
      );

      const after = balance - price;
      await client.query(
        `INSERT INTO transactions (user_id, kind, amount, balance_after, description, reference_id, metadata)
         VALUES ($1, 'unlock', $2, $3, $4, $5, '{"side":"debit"}')`,
        [userId, -price, after, `Unlocked post #${postId}`, `post:${postId}`]
      );
      const authorRow = await client.query(
        'SELECT duys_tokens FROM users WHERE id = $1', [row.author_id]
      );
      await client.query(
        `INSERT INTO transactions (user_id, kind, amount, balance_after, description, reference_id, metadata)
         VALUES ($1, 'unlock', $2, $3, $4, $5, '{"side":"credit"}')`,
        [row.author_id, price, Number(authorRow.rows[0]?.duys_tokens || 0), `Locked content sale #${postId}`, `post:${postId}`]
      );
    }

    await client.query(
      'INSERT INTO post_unlocks (user_id, post_id, paid) VALUES ($1, $2, $3)',
      [userId, postId, price]
    );
    return { unlocked: true };
  });
}

/**
 * Record a post view (deduped per user) and bump view_count once.
 */
export async function recordPostView(postId, userId = null) {
  if (!userId) {
    await query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [postId]);
    return { counted: true };
  }
  const inserted = await query(
    `INSERT INTO post_views (post_id, user_id) VALUES ($1, $2)
     ON CONFLICT ON CONSTRAINT post_views_post_id_user_id_key DO NOTHING
     RETURNING id`,
    [postId, userId]
  );
  if (inserted.rows[0]) {
    await query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [postId]);
    return { counted: true };
  }
  return { counted: false };
}

/**
 * Pin a post to the author's profile (one active pin per author).
 */
export async function pinPost(postId, userId) {
  const post = await queryOne('SELECT id, author_id FROM posts WHERE id = $1 AND deleted_at IS NULL', [postId]);
  if (!post) throw new Error('Post not found');
  if (post.author_id !== userId) throw new Error('You can only pin your own posts');

  await transaction(async (client) => {
    await client.query(
      'UPDATE posts SET is_pinned = false WHERE author_id = $1 AND is_pinned = true',
      [userId]
    );
    await client.query(
      'UPDATE posts SET is_pinned = true, pinned_at = NOW() WHERE id = $1',
      [postId]
    );
  });
  return { pinned: true };
}

/**
 * Unpin a post.
 */
export async function unpinPost(postId, userId) {
  const post = await queryOne('SELECT id, author_id FROM posts WHERE id = $1', [postId]);
  if (!post) throw new Error('Post not found');
  if (post.author_id !== userId) throw new Error('You can only unpin your own posts');

  await query('UPDATE posts SET is_pinned = false, pinned_at = NULL WHERE id = $1', [postId]);
  return { pinned: false };
}

const REPORT_REASONS = ['spam', 'harassment', 'hate', 'misinformation', 'violence', 'other'];

/**
 * Submit a content report for moderation review.
 */
export async function reportPost(reporterId, { entityType = 'post', entityId, reason, description = '' }) {
  if (!['post', 'user', 'comment'].includes(entityType)) throw new Error('Invalid entity type');
  if (!REPORT_REASONS.includes(reason)) throw new Error('Invalid report reason');
  const entityIdNum = Number(entityId);
  if (!entityIdNum) throw new Error('Entity ID is required');

  const result = await query(
    `INSERT INTO reports (reporter_id, entity_type, entity_id, reason, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, status`,
    [reporterId, entityType, entityIdNum, reason, String(description || '').slice(0, 1000)]
  );
  return result.rows[0];
}

export default {
  createPost,
  queueLinkPreview,
  notifyMentions,
  hydratePostRow,
  hydratePosts,
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
  quotePost,
  votePoll,
  unlockPost,
  recordPostView,
  pinPost,
  unpinPost,
  reportPost
};
