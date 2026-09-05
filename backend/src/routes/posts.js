import express from 'express';
import Joi from 'joi';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as postService from '../services/postService.js';
import { queryOne } from '../config/database.js';
import { uploadPublic, deletePublic } from '../services/storage.js';
import * as notificationsService from '../services/notificationsService.js';

// Create a notification without letting a failure break the core action.
const safeNotify = (fn) => fn().catch((e) => console.error('[notify]', e));

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /posts
 * Create a post
 */
router.post('/', async (req, res) => {
  const schema = Joi.object({
    kind: Joi.string().valid('text', 'image', 'video', 'poll', 'article').default('text'),
    body: Joi.string().max(10000),
    title: Joi.string().max(500),
    channelId: Joi.number().integer(),
    isExclusive: Joi.boolean().default(false),
    unlockPrice: Joi.number().min(0).default(0),
    scheduledAt: Joi.date().iso(),
    pollOptions: Joi.array().items(Joi.string().max(500)).max(6),
    mediaUrl: Joi.string().uri().allow('').default(''),
    mediaKey: Joi.string().allow('').default(''),
    mediaType: Joi.string().valid('image', 'video', 'audio').allow('').default('')
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    // Exclusive + scheduled posting is a verified-creator feature (legacy parity).
    if (value.isExclusive || value.scheduledAt) {
      const me = await queryOne('SELECT verified_badge FROM users WHERE id = $1', [req.userId]);
      if (!me || !me.verified_badge) {
        return res.status(403).json({ error: 'Only verified creators can post exclusive or scheduled content' });
      }
    }

    const post = await postService.createPost(req.userId, value);
    // Side-effects that must not fail the post: link preview + mention notifications.
    if (value.body) {
      postService.queueLinkPreview(post.id, value.body);
      postService.notifyMentions(post.id, req.userId, value.body).catch(() => {});
    }
    const hydrated = await postService.getPostById(post.id, req.userId);
    res.status(201).json(hydrated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /posts/:postId
 * Get post
 */
router.get('/:postId', async (req, res) => {
  try {
    const post = await postService.getPostById(req.params.postId, req.userId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /posts/:postId
 * Update post
 */
router.patch('/:postId', async (req, res) => {
  const schema = Joi.object({
    body: Joi.string().max(5000),
    title: Joi.string().max(500)
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const updated = await postService.updatePost(req.params.postId, req.userId, value);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /posts/:postId
 * Delete post
 */
router.delete('/:postId', async (req, res) => {
  try {
    await postService.deletePost(req.params.postId, req.userId);
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/like
 * Like a post
 */
router.post('/:postId/like', async (req, res) => {
  try {
    await postService.likePost(req.params.postId, req.userId);
    safeNotify(() => notificationsService.notifyPostLiked(req.params.postId, req.userId));
    res.json({ message: 'Post liked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /posts/:postId/like
 * Unlike a post
 */
router.delete('/:postId/like', async (req, res) => {
  try {
    await postService.unlikePost(req.params.postId, req.userId);
    res.json({ message: 'Post unliked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/comments
 * Comment on post
 */
router.post('/:postId/comments', async (req, res) => {
  const schema = Joi.object({
    body: Joi.string().min(1).max(5000).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const comment = await postService.commentOnPost(req.params.postId, req.userId, value.body);
    safeNotify(() => notificationsService.notifyCommented(req.params.postId, req.userId));
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /posts/:postId/comments
 * Get post comments
 */
router.get('/:postId/comments', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const comments = await postService.getPostComments(req.params.postId, limit, offset);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/repost
 * Repost (share) a post
 */
router.post('/:postId/repost', async (req, res) => {
  try {
    const post = await postService.repostPost(req.params.postId, req.userId);
    safeNotify(() => notificationsService.notifyReposted(req.params.postId, req.userId));
    res.status(201).json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/quote
 * Quote a post
 */
router.post('/:postId/quote', async (req, res) => {
  const schema = Joi.object({
    body: Joi.string().min(1).max(5000).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const post = await postService.quotePost(req.params.postId, req.userId, value.body);
    safeNotify(() => notificationsService.notifyQuoted(req.params.postId, req.userId));
    res.status(201).json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/report', async (req, res) => {
  const schema = Joi.object({
    entityType: Joi.string().valid('post', 'user', 'comment').default('post'),
    entityId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required(),
    reason: Joi.string().valid('spam', 'harassment', 'hate', 'misinformation', 'violence', 'other').required(),
    description: Joi.string().max(1000).allow('').default('')
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const report = await postService.reportPost(req.userId, value);
    res.status(201).json({ message: 'Report submitted. Thank you — our team will review it.', report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/view
 * Record a deduped post view (increments view_count once per user).
 */
router.post('/:postId/view', async (req, res) => {
  try {
    const { counted } = await postService.recordPostView(req.params.postId, req.userId);
    const viewCount = await queryOne('SELECT view_count FROM posts WHERE id = $1', [req.params.postId]);
    res.json({ counted, view_count: viewCount?.view_count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/vote
 * Cast a poll vote.
 */
router.post('/:postId/vote', async (req, res) => {
  const schema = Joi.object({ optionId: Joi.number().integer().required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const pollOptions = await postService.votePoll(req.params.postId, req.userId, value.optionId);
    res.json({ ok: true, poll_options: pollOptions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/unlock
 * Pay DUYS tokens to unlock an exclusive post.
 */
router.post('/:postId/unlock', async (req, res) => {
  try {
    await postService.unlockPost(req.params.postId, req.userId);
    const post = await postService.getPostById(req.params.postId, req.userId);
    res.json({ message: 'Post unlocked', post });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /posts/:postId/pin  — pin your post to your profile
 * DELETE /posts/:postId/pin — unpin
 */
router.post('/:postId/pin', async (req, res) => {
  try {
    const result = await postService.pinPost(req.params.postId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:postId/pin', async (req, res) => {
  try {
    const result = await postService.unpinPost(req.params.postId, req.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /posts/media
 * Upload media (images, videos) to R2 public bucket
 */
router.post('/media', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Media file required' });
    }

    // Validate media type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
    if (!validTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid media type. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM' });
    }

    // Validate file size (50MB max)
    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be < 50MB' });
    }

    const mediaId = uuidv4();
    const ext = req.file.mimetype.split('/')[1];
    const key = `posts/${req.userId}/${mediaId}.${ext}`;

    // Upload to public R2 bucket
    const url = await uploadPublic(key, req.file.buffer, req.file.mimetype);

    res.json({
      mediaId,
      url,
      key,
      type: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
      size: req.file.size
    });
  } catch (error) {
    console.error('[Media Upload]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /posts/media/:mediaId
 * Delete uploaded media from R2
 */
router.delete('/media/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    // Find and delete the media file
    // In production, you'd query the database to find the actual key
    // For now, we'll require the key to be passed in body
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Media key required' });
    }

    // Verify user owns this media (simple check - key starts with their userId)
    if (!key.includes(`posts/${req.userId}`)) {
      return res.status(403).json({ error: 'Unauthorized to delete this media' });
    }

    await deletePublic(key);
    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('[Media Delete]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
