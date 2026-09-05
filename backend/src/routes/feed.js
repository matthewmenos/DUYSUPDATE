import express from 'express';
import * as feedService from '../services/feedService.js';

const router = express.Router();

/**
 * GET /feed/for-you
 * Get personalized feed (for you)
 */
router.get('/for-you', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
    
    const posts = await feedService.getForYouFeed(req.userId, limit, beforeId);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/following
 * Get following feed
 */
router.get('/following', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
    
    const posts = await feedService.getFollowingFeed(req.userId, limit, beforeId);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/channel/:channelId
 * Get channel feed
 */
router.get('/channel/:channelId', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
    
    const posts = await feedService.getChannelFeed(req.params.channelId, limit, beforeId);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/trending
 * Get trending posts
 */
router.get('/trending', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const posts = await feedService.getTrendingPosts(limit);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/hashtags
 * Get trending hashtags. Optional `q` filters by prefix (autocomplete).
 */
router.get('/hashtags', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).toLowerCase() : null;
    const limit = Math.min(parseInt(req.query.limit) || 10, 25);
    const hashtags = await feedService.getTrendingHashtags(q, limit);
    res.json({ hashtags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/top-verified
 * Get top verified users for the search overlay.
 */
router.get('/top-verified', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 25);
    const users = await feedService.getTopVerifiedUsers(limit);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/live-users
 * Get followed users currently hosting a live room (rooms with status='live').
 */
router.get('/live-users', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 25);
    const live = await feedService.getLiveUsers(req.userId, limit);
    res.json({ live });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/hashtag/:tag
 * Get posts by hashtag
 */
router.get('/hashtag/:tag', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
    
    const posts = await feedService.getHashtagFeed(req.params.tag, limit, beforeId);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /feed/user/:userId
 * Get user's posts (profile feed)
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
    
    const posts = await feedService.getUserFeed(req.params.userId, req.userId, limit, beforeId);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
