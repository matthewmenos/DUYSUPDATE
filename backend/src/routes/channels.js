import express from 'express';
import Joi from 'joi';
import * as channelsService from '../services/channelsService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /channels
 * Create a channel (creator becomes owner).
 */
router.post('/', async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    handle: Joi.string().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/).required(),
    description: Joi.string().max(500).allow('').default(''),
    isPrivate: Joi.boolean().default(false)
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const channel = await channelsService.createChannel(req.userId, value);
    res.status(201).json(channel);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /channels?limit=&offset=
 * List public channels by subscriber count.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const channels = await channelsService.getChannels(limit, offset);
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /channels/:channelId
 * Get channel detail with subscribe state.
 */
router.get('/:channelId', async (req, res) => {
  try {
    const channel = await channelsService.getChannelById(req.params.channelId, req.userId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json(channel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /channels/:channelId
 * Update channel (owner/moderator only).
 */
router.patch('/:channelId', async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    avatar_url: Joi.string().uri().allow(''),
    banner_url: Joi.string().uri().allow(''),
    isPrivate: Joi.boolean()
  }).min(1);
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const channel = await channelsService.updateChannel(req.params.channelId, req.userId, value);
    res.json(channel);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /channels/:channelId
 * Delete a channel (owner only).
 */
router.delete('/:channelId', async (req, res) => {
  try {
    const result = await channelsService.deleteChannel(req.params.channelId, req.userId);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /channels/:channelId/subscribe
 * Subscribe to a channel.
 */
router.post('/:channelId/subscribe', async (req, res) => {
  try {
    const result = await channelsService.subscribeToChannel(req.userId, req.params.channelId);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /channels/:channelId/subscribe
 * Unsubscribe from a channel.
 */
router.delete('/:channelId/subscribe', async (req, res) => {
  try {
    const result = await channelsService.unsubscribeFromChannel(req.userId, req.params.channelId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /channels/:channelId/posts?limit=&beforeId=
 * Get a channel's posts feed.
 */
router.get('/:channelId/posts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;
    const posts = await channelsService.getChannelPosts(req.params.channelId, limit, beforeId);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /channels/:channelId/subscribers?limit=&offset=
 * List a channel's subscribers.
 */
router.get('/:channelId/subscribers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const subscribers = await channelsService.getChannelSubscribers(req.params.channelId, limit, offset);
    res.json({ subscribers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
