import express from 'express';
import * as notificationsService from '../services/notificationsService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /notifications?limit=&offset=
 * List the authenticated user's notifications, unread first.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const notifications = await notificationsService.getNotifications(req.userId, limit, offset);
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /notifications/unread
 * Unread count + preview of the latest notifications.
 */
router.get('/unread', async (req, res) => {
  try {
    const data = await notificationsService.getUnreadPreview(req.userId, 5);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /notifications/:notificationId/read
 * Mark a single notification as read.
 */
router.patch('/:notificationId/read', async (req, res) => {
  try {
    const notification = await notificationsService.markAsRead(req.params.notificationId, req.userId);
    res.json(notification);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /notifications/read-all
 * Mark all notifications as read.
 */
router.post('/read-all', async (req, res) => {
  try {
    const result = await notificationsService.markAllAsRead(req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /notifications/:notificationId
 * Delete a single notification (owner only).
 */
router.delete('/:notificationId', async (req, res) => {
  try {
    const result = await notificationsService.deleteNotification(req.params.notificationId, req.userId);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
