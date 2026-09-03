import express from 'express';
import Joi from 'joi';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as storiesService from '../services/storiesService.js';
import { uploadPublic } from '../services/storage.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /stories
 * Create a story. Supports both:
 *   - multipart/form-data with a `media` file (uploads straight to R2), or
 *   - JSON with { mediaUrl, mediaKey, mediaKind, caption } (media already
 *     uploaded via POST /posts/media).
 * The story automatically expires 24 hours from creation.
 */
router.post('/', upload.single('media'), async (req, res) => {
  try {
    let caption = '';
    let mediaUrl = '';
    let mediaKey = '';
    let mediaKind = 'image';

    if (req.file) {
      // Direct file upload path
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
      if (!validTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Invalid media type. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM' });
      }
      if (req.file.size > 50 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size must be < 50MB' });
      }

      const ext = req.file.mimetype.split('/')[1];
      const key = `stories/${req.userId}/${uuidv4()}.${ext}`;
      mediaUrl = await uploadPublic(key, req.file.buffer, req.file.mimetype);
      mediaKey = key;
      mediaKind = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
      caption = req.body?.caption || '';
    } else {
      // JSON body path (media pre-uploaded via /posts/media)
      const schema = Joi.object({
        mediaUrl: Joi.string().uri().required(),
        mediaKey: Joi.string().allow('').optional(),
        mediaKind: Joi.string().valid('image', 'video').default('image'),
        caption: Joi.string().max(500).allow('').default('')
      });

      const { error, value } = schema.validate(req.body || {});
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }
      mediaUrl = value.mediaUrl;
      mediaKey = value.mediaKey || '';
      mediaKind = value.mediaKind;
      caption = value.caption;
    }

    const story = await storiesService.createStory(req.userId, {
      mediaUrl,
      mediaKey,
      mediaKind,
      caption
    });

    res.status(201).json(story);
  } catch (error) {
    console.error('[Story Create]', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /stories?limit=&offset=
 * Get a feed of active stories from followed users + the viewer's own.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    const stories = await storiesService.getStoriesFeed(req.userId, limit, offset);
    res.json({ stories });
  } catch (error) {
    console.error('[Story Feed]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /stories/:storyId
 * Get a single active story with viewer context.
 */
router.get('/:storyId', async (req, res) => {
  try {
    const story = await storiesService.getStoryById(req.params.storyId, req.userId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found or expired' });
    }
    res.json(story);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /stories/:storyId
 * Soft-delete a story (author only) + remove R2 file.
 */
router.delete('/:storyId', async (req, res) => {
  try {
    const result = await storiesService.deleteStory(req.params.storyId, req.userId);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /stories/:storyId/view
 * Record a story view (idempotent).
 */
router.post('/:storyId/view', async (req, res) => {
  try {
    const result = await storiesService.recordStoryView(req.params.storyId, req.userId);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /stories/:storyId/react
 * Add/update the viewer's reaction (emoji). Returns aggregated reactions.
 */
router.post('/:storyId/react', async (req, res) => {
  const schema = Joi.object({
    emoji: Joi.string().required()
  });

  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await storiesService.reactToStory(req.params.storyId, req.userId, value.emoji);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /stories/:storyId/react
 * Remove the viewer's reaction.
 */
router.delete('/:storyId/react', async (req, res) => {
  try {
    const result = await storiesService.removeStoryReaction(req.params.storyId, req.userId);
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /stories/:storyId/reactions
 * Get aggregated reactions for a story.
 */
router.get('/:storyId/reactions', async (req, res) => {
  try {
    res.json(await storiesService.getStoryReactions(req.params.storyId, req.userId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
