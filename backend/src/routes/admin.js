import express from 'express';
import Joi from 'joi';
import * as adminService from '../services/adminService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /admin/dashboard
 * Platform overview stats.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/users?limit=&offset=&sortBy=
 * List all users with moderation flags.
 */
router.get('/users', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const sortBy = req.query.sortBy || 'newest';
    const users = await adminService.getUsers(limit, offset, sortBy);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/users/:userId
 * Full user details + history.
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const data = await adminService.getUserDetails(req.params.userId);
    res.json(data);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /admin/users/:userId/ban
 * Ban a user (soft-deletes their posts).
 */
router.patch('/users/:userId/ban', async (req, res) => {
  const schema = Joi.object({ reason: Joi.string().max(500).allow('').default('') });
  const { value } = schema.validate(req.body || {});
  try {
    const result = await adminService.banUser(req.params.userId, req.userId, value.reason);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /admin/users/:userId/unban
 * Restore a banned user.
 */
router.patch('/users/:userId/unban', async (req, res) => {
  const schema = Joi.object({ reason: Joi.string().max(500).allow('').default('') });
  const { value } = schema.validate(req.body || {});
  try {
    const result = await adminService.unbanUser(req.params.userId, req.userId, value.reason);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/reports?limit=&offset=&status=
 * List reports, filtered by status (pending/reviewing/dismissed/actioned/all).
 */
router.get('/reports', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || 'pending';
    const reports = await adminService.getReports(limit, offset, status);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/reports/:reportId
 * Full report details with reporter + target info.
 */
router.get('/reports/:reportId', async (req, res) => {
  try {
    const report = await adminService.getReportDetails(req.params.reportId);
    res.json(report);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /admin/reports/:reportId
 * Resolve a report (action: approved/rejected/warned).
 */
router.patch('/reports/:reportId', async (req, res) => {
  const schema = Joi.object({
    action: Joi.string().valid('approved', 'rejected', 'warned').required(),
    notes: Joi.string().max(1000).allow('').default('')
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const report = await adminService.resolveReport(req.params.reportId, req.userId, value.action, value.notes);
    res.json(report);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/analytics
 * Platform metrics (DAU, signups, revenue, token volume, top creators).
 */
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await adminService.getAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
