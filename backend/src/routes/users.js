import express from 'express';
import Joi from 'joi';
import * as userService from '../services/userService.js';
import * as notificationsService from '../services/notificationsService.js';

const router = express.Router();

/**
 * PATCH /users/me/password
 * Change password (requires current password).
 */
router.patch('/me/password', async (req, res) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required()
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    await userService.changePassword(req.userId, value.currentPassword, value.newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /users/me/privacy
 * Update privacy settings (private account, who can message, online status).
 */
router.patch('/me/privacy', async (req, res) => {
  const schema = Joi.object({
    isPrivate: Joi.boolean(),
    whoCanMessage: Joi.string().valid('everyone', 'followers', 'nobody'),
    showOnlineStatus: Joi.boolean()
  }).min(1);
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const map = { isPrivate: 'is_private', whoCanMessage: 'who_can_message', showOnlineStatus: 'show_online_status' };
    const updates = {};
    for (const [k, v] of Object.entries(value)) updates[map[k]] = v;
    const updated = await userService.updateUserProfile(req.userId, updates);
    const { password_hash, twofa_secret, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /users/me/notifications
 * Update per-type notification preferences.
 */
router.patch('/me/notifications', async (req, res) => {
  const schema = Joi.object({
    likes: Joi.boolean(),
    comments: Joi.boolean(),
    follows: Joi.boolean(),
    mentions: Joi.boolean(),
    messages: Joi.boolean(),
    reposts: Joi.boolean()
  }).min(1);
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    await userService.updateNotificationPreferences(req.userId, value);
    res.json({ message: 'Notification preferences updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /users/me/notifications/preferences
 * Get current notification preferences.
 */
router.get('/me/notifications/preferences', async (req, res) => {
  try {
    const prefs = await userService.getNotificationPreferences(req.userId);
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/me/blocked
 * List users blocked by the current user.
 */
router.get('/me/blocked', async (req, res) => {
  try {
    const blocked = await userService.getBlockedUsers(req.userId);
    res.json(blocked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /users/:userId/block
 * Block a user.
 */
router.post('/:userId/block', async (req, res) => {
  try {
    if (req.userId === parseInt(req.params.userId)) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }
    await userService.blockUser(req.userId, req.params.userId);
    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /users/:userId/block
 * Unblock a user.
 */
router.delete('/:userId/block', async (req, res) => {
  try {
    await userService.unblockUser(req.userId, req.params.userId);
    res.json({ message: 'User unblocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /users/me/export
 * Request a data export.
 */
router.post('/me/export', async (req, res) => {
  try {
    const result = await userService.requestDataExport(req.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /users/me
 * Delete account and all associated data.
 */
router.delete('/me', async (req, res) => {
  const schema = Joi.object({ password: Joi.string().required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    await userService.deleteAccount(req.userId, value.password);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /users/me
 * Get full current user profile (for settings page).
 */
router.get('/me', async (req, res) => {
  try {
    const user = await userService.getUserById(req.userId);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/:userId
 * Get user profile
 */
router.get('/me', async (req, res) => {
  try {
    const user = await userService.getUserById(req.userId);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/:userId
 * Get user profile
 */
router.get('/:userId', async (req, res) => {
  try {
    const user = await userService.getUserProfile(req.params.userId, req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/by-username/:username
 * Get user profile by username
 */
router.get('/by-username/:username', async (req, res) => {
  try {
    const user = await userService.getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(await userService.getUserProfile(user.id, req.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /users/me
 * Update current user profile
 */
router.patch('/me', async (req, res) => {
  const schema = Joi.object({
    displayName: Joi.string().min(1).max(100),
    bio: Joi.string().max(500),
    location: Joi.string().max(100),
    website: Joi.string().uri(),
    avatarUrl: Joi.string().uri(),
    bannerUrl: Joi.string().uri(),
    theme: Joi.string().valid('light', 'dark'),
    profileSlug: Joi.string().alphanum().max(100)
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  // Map the camelCase API keys to the snake_case columns the service expects.
  const keyMap = {
    displayName: 'display_name',
    avatarUrl: 'avatar_url',
    bannerUrl: 'banner_url',
    profileSlug: 'profile_slug'
  };
  const updates = {};
  for (const [key, val] of Object.entries(value)) {
    updates[keyMap[key] || key] = val;
  }

  try {
    const updated = await userService.updateUserProfile(req.userId, updates);
    if (!updated) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    // Never leak sensitive columns back to the client.
    const { password_hash, twofa_secret, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /users/:userId/follow
 * Follow a user
 */
router.post('/:userId/follow', async (req, res) => {
  try {
    if (req.userId === parseInt(req.params.userId)) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    await userService.followUser(req.userId, req.params.userId);
    notificationsService.notifyFollowed(req.params.userId, req.userId).catch((e) => console.error('[notify]', e));
    res.json({ message: 'User followed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /users/:userId/follow
 * Unfollow a user
 */
router.delete('/:userId/follow', async (req, res) => {
  try {
    await userService.unfollowUser(req.userId, req.params.userId);
    res.json({ message: 'User unfollowed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/:userId/followers
 * Get user followers
 */
router.get('/:userId/followers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const followers = await userService.getUserFollowers(req.params.userId, limit, offset);
    res.json(followers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/:userId/following
 * Get user following
 */
router.get('/:userId/following', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const following = await userService.getUserFollowing(req.params.userId, limit, offset);
    res.json(following);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/search?q=query
 * Search users
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const results = await userService.searchUsers(q, 20);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /users/suggestions
 * Get follow suggestions
 */
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = await userService.getFollowSuggestions(req.userId, 10);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
