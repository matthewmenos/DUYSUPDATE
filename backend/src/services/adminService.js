import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Admin moderation service.
 *
 * Adapted to the actual schema:
 * - `reports` links a target via `entity_type`/`entity_id` ('user' | 'post' |
 *   'comment' | 'message') and uses `reviewed_by`/`reviewed_at`/`action_taken`
 *   for the resolution (no `status='resolved'`; statuses are
 *   pending/reviewing/dismissed/actioned).
 * - `admin_logs` uses `action`, `entity_type`, `entity_id` and `details` JSONB.
 * - Analytics read from `users` (duys_tokens/balance_cents/last_seen),
 *   `transactions` (kind/amount) and `posts`.
 */

// ============================================================================
// Audit trail
// ============================================================================

export async function logAdminAction(adminId, action, { entityType = null, entityId = null, details = {}, ipAddress = null } = {}) {
  await query(
    `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminId, action, entityType, entityId, JSON.stringify(details || {}), ipAddress]
  );
}

// ============================================================================
// Dashboard
// ============================================================================

export async function getDashboardStats() {
  const [users, posts, activeUsers, openReports] = await Promise.all([
    queryOne(`SELECT COUNT(*)::int AS total FROM users WHERE is_banned = false`),
    queryOne(`SELECT COUNT(*)::int AS total FROM posts WHERE deleted_at IS NULL`),
    // Active users: active in the last 7 days.
    queryOne(`SELECT COUNT(*)::int AS total FROM users WHERE is_banned = false AND last_seen > NOW() - INTERVAL '7 days'`),
    // Open reports: pending or reviewing.
    queryOne(`SELECT COUNT(*)::int AS total FROM reports WHERE status IN ('pending', 'reviewing')`)
  ]);

  return {
    totalUsers: users ? users.total : 0,
    totalPosts: posts ? posts.total : 0,
    activeUsers7d: activeUsers ? activeUsers.total : 0,
    openReports: openReports ? openReports.total : 0
  };
}

// ============================================================================
// Users
// ============================================================================

export async function getUsers(limit = 20, offset = 0, sortBy = 'newest') {
  const orderMap = {
    newest: 'created_at DESC, id DESC',
    oldest: 'created_at ASC, id ASC',
    banned: 'is_banned DESC, created_at DESC',
    verified: "verified_badge != '' DESC, created_at DESC"
  };
  const order = orderMap[sortBy] || orderMap.newest;

  return queryAll(
    `SELECT id, username, display_name, email, avatar_url, is_admin, is_banned,
            verified_badge, duys_tokens::float AS duys_tokens, points,
            last_seen, created_at,
            (SELECT COUNT(*) FROM posts WHERE author_id = users.id AND deleted_at IS NULL) AS post_count,
            (SELECT COUNT(*) FROM reports WHERE reporter_id = users.id) AS reports_made
     FROM users
     ORDER BY ${order}
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}
/**
 * Full user profile with account history (logs, transactions) and associated reports.
 */
export async function getUserDetails(userId) {
  const user = await queryOne(
    `SELECT id, username, display_name, email, bio, avatar_url, banner_url,
            is_admin, is_banned, verified_badge, duys_tokens::float AS duys_tokens,
            balance_cents, points, last_seen, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  if (!user) throw new AppError('User not found', 404);

  const [adminLogs, transactions, reportsMade, reportsReceived] = await Promise.all([
    queryAll(
      `SELECT id, admin_id, action, entity_type, entity_id, details, created_at
       FROM admin_logs
       WHERE entity_type = 'user' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    ),
    queryAll(
      `SELECT id, kind, amount::float AS amount, description, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    ),
    queryAll(
      `SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    ),
    queryAll(
      `SELECT * FROM reports WHERE entity_type = 'user' AND entity_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    )
  ]);

  return { user, adminLogs, transactions, reportsMade, reportsReceived };
}

/**
 * Ban a user: flag them and soft-delete their posts.
 */
export async function banUser(userId, adminId, reason = '') {
  const user = await queryOne('SELECT id, is_admin, is_banned FROM users WHERE id = $1', [userId]);
  if (!user) throw new AppError('User not found', 404);
  if (user.is_admin) throw new AppError('Cannot ban an administrator', 400);

  if (!user.is_banned) {
    await query('UPDATE users SET is_banned = true WHERE id = $1', [userId]);
  }
  // Soft-delete all of the user's posts.
  await query(
    `UPDATE posts SET deleted_at = COALESCE(deleted_at, NOW())
     WHERE author_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  await logAdminAction(adminId, 'ban_user', {
    entityType: 'user',
    entityId: Number(userId),
    details: { reason }
  });

  return { success: true, userId };
}

/**
 * Restore a banned user.
 */
export async function unbanUser(userId, adminId, reason = '') {
  const user = await queryOne('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw new AppError('User not found', 404);

  await query('UPDATE users SET is_banned = false WHERE id = $1', [userId]);
  await logAdminAction(adminId, 'unban_user', {
    entityType: 'user',
    entityId: Number(userId),
    details: { reason }
  });

  return { success: true, userId };
}
// ============================================================================
// Reports
// ============================================================================

const REPORT_SELECT = `
  r.id, r.reporter_id, r.entity_type, r.entity_id, r.reason, r.description,
  r.status, r.action_taken, r.reviewed_by, r.reviewed_at, r.created_at,
  rep.username AS reporter_username, rep.display_name AS reporter_display_name,
  rep.avatar_url AS reporter_avatar_url
`;

/**
 * List reports, optionally filtered by status.
 */
export async function getReports(limit = 20, offset = 0, status = 'pending') {
  const params = [limit, offset];
  let statusClause = '';

  if (status && status !== 'all') {
    statusClause = 'WHERE r.status = $3::text';
    params.push(status);
  }

  return queryAll(
    `SELECT ${REPORT_SELECT}
     FROM reports r
     JOIN users rep ON r.reporter_id = rep.id
     ${statusClause}
     ORDER BY r.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );
}

/**
 * Full report with reporter + target info.
 */
export async function getReportDetails(reportId) {
  const report = await queryOne(
    `SELECT r.*,
            rep.username AS reporter_username, rep.display_name AS reporter_display_name,
            rep.avatar_url AS reporter_avatar_url,
            rev.username AS reviewer_username
     FROM reports r
     JOIN users rep ON r.reporter_id = rep.id
     LEFT JOIN users rev ON r.reviewed_by = rev.id
     WHERE r.id = $1`,
    [reportId]
  );
  if (!report) throw new AppError('Report not found', 404);

  let target = null;
  if (report.entity_type === 'user') {
    target = await queryOne(
      `SELECT id, username, display_name, avatar_url, is_banned, verified_badge, created_at
       FROM users WHERE id = $1`,
      [report.entity_id]
    );
  } else if (report.entity_type === 'post') {
    target = await queryOne(
      `SELECT p.id, p.body, p.kind, p.author_id, p.deleted_at,
              u.username AS author_username, u.display_name AS author_display_name
       FROM posts p
       JOIN users u ON p.author_id = u.id
       WHERE p.id = $1`,
      [report.entity_id]
    );
  }

  return { ...report, target };
}

/**
 * Resolve a report.
 * action: 'approved' | 'rejected' | 'warned'
 */
export async function resolveReport(reportId, adminId, action = 'rejected', notes = '') {
  const report = await queryOne('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!report) throw new AppError('Report not found', 404);

  const status = (action === 'approved' || action === 'warned') ? 'actioned' : 'dismissed';

  await query(
    `UPDATE reports
     SET status = $2, reviewed_by = $3, action_taken = $4, reviewed_at = NOW()
     WHERE id = $1`,
    [reportId, status, adminId, action]
  );

  // Handle the action: ban the target user if the report is about a user.
  if (action === 'approved' && report.entity_type === 'user') {
    try {
      await banUser(report.entity_id, adminId, notes || `Resolved from report #${reportId}`);
    } catch (err) {
      console.error('[admin][resolveReport] ban failed', err.message);
    }
  }

  await logAdminAction(adminId, `report_${action}`, {
    entityType: 'report',
    entityId: Number(reportId),
    details: { notes }
  });

  return getReportDetails(reportId);
}

// ============================================================================
// Analytics
// ============================================================================

/**
 * Platform metrics: DAU, new signups, revenue, token volume, top creators.
 */
export async function getAnalytics() {
  const [dau, newToday, newWeek, revenue, tokenVolume, topCreators] = await Promise.all([
    // DAU: users active in the last 24 hours.
    queryOne(
      `SELECT COUNT(*)::int AS value
       FROM users
       WHERE is_banned = false AND last_seen > NOW() - INTERVAL '24 hours'`
    ),
    queryOne(`SELECT COUNT(*)::int AS value FROM users WHERE created_at::date = CURRENT_DATE`),
    queryOne(`SELECT COUNT(*)::int AS value FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
    // Revenue: sum of deposits in the last 7 days.
    queryOne(
      `SELECT COALESCE(SUM(amount), 0)::float AS value
       FROM transactions
       WHERE kind = 'deposit' AND created_at > NOW() - INTERVAL '7 days'`
    ),
    // Token volume: total DUYS across accounts.
    queryOne(
      `SELECT COALESCE(SUM(duys_tokens), 0)::float AS value FROM users`
    ),
    // Top creators by engagement (non-deleted posts).
    queryAll(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge,
              p.post_count,
              (p.likes + p.comments + p.reposts + p.quotes)::int AS engagement,
              u.duys_tokens::float AS duys_tokens
       FROM users u
       JOIN (
         SELECT author_id,
                COUNT(*) AS post_count,
                SUM(like_count) AS likes,
                SUM(comment_count) AS comments,
                SUM(repost_count) AS reposts,
                SUM(quote_count) AS quotes
         FROM posts
         WHERE deleted_at IS NULL
         GROUP BY author_id
       ) p ON p.author_id = u.id
       ORDER BY engagement DESC
       LIMIT 10`
    )
  ]);

  return {
    dau: dau ? dau.value : 0,
    newUsersToday: newToday ? newToday.value : 0,
    newUsersThisWeek: newWeek ? newWeek.value : 0,
    revenue7d: revenue ? revenue.value : 0,
    tokenVolume: tokenVolume ? tokenVolume.value : 0,
    topCreators: topCreators || []
  };
}

// ============================================================================
// Verification requests (badge / face / id)
// ============================================================================

/**
 * List verification requests, optionally filtered by status/type.
 */
export async function getVerificationRequests({ status = 'pending', type = null, limit = 50 } = {}) {
  let sql = `SELECT vr.id, vr.type, vr.requested_badge, vr.cost_paid, vr.status,
                    vr.admin_notes, vr.created_at,
                    u.id AS user_id, u.username, u.display_name, u.email, u.avatar_url,
                    u.points, u.verified_badge
             FROM verification_requests vr
             JOIN users u ON u.id = vr.user_id
             WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') {
    params.push(status);
    sql += ` AND vr.status = $${params.length}`;
  }
  if (type) {
    params.push(type);
    sql += ` AND vr.type = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY vr.created_at DESC LIMIT $${params.length}`;
  return queryAll(sql, params);
}

export async function getVerificationRequestById(id) {
  const req = await queryOne(
    `SELECT vr.*, u.username, u.display_name, u.email
     FROM verification_requests vr
     JOIN users u ON u.id = vr.user_id
     WHERE vr.id = $1`,
    [id]
  );
  if (!req) throw new AppError('Verification request not found', 404);
  return req;
}

/**
 * Approve or reject a verification request.
 * - For 'badge': on approve, sets the user's verified_badge + expiry.
 * - Logs the admin action.
 */
export async function decideVerificationRequest(requestId, adminId, decision, notes = '') {
  const req = await getVerificationRequestById(requestId);
  if (req.status !== 'pending') {
    throw new AppError('Request already reviewed', 400);
  }

  await query(
    `UPDATE verification_requests
     SET status = $2, admin_notes = $3, reviewed_by = $4, reviewed_at = NOW()
     WHERE id = $1`,
    [requestId, decision, notes, adminId]
  );

  if (decision === 'approved') {
    if (req.type === 'badge' && req.requested_badge) {
      const badge = req.requested_badge;
      const expiryDays = badge === 'gold' ? 365 : badge === 'blue' ? 365 : 180;
      await query(
        `UPDATE users
         SET verified_badge = $2, verified_badge_expires = NOW() + ($3::int * INTERVAL '1 day')
         WHERE id = $1`,
        [req.user_id, badge, expiryDays]
      );
    }
  }

  await logAdminAction(adminId, `verify_${req.type}_${decision}`, {
    entityType: 'verification_requests',
    entityId: Number(requestId),
    details: { userId: req.user_id, badge: req.requested_badge, notes }
  });

  return getVerificationRequestById(requestId);
}

// ============================================================================
// Economy controls
// ============================================================================

export async function adjustUserEconomy(userId, adminId, { deltaPoints = 0, deltaTokens = 0, note = '' }) {
  const user = await queryOne('SELECT id, points, duys_tokens FROM users WHERE id = $1', [userId]);
  if (!user) throw new AppError('User not found', 404);

  const newPoints = Math.max(0, (user.points || 0) + deltaPoints);
  const newTokens = Math.max(0, parseFloat(user.duys_tokens || 0) + deltaTokens);

  await query(
    `UPDATE users SET points = $2, duys_tokens = $3 WHERE id = $1`,
    [userId, newPoints, newTokens.toFixed(2)]
  );

  await logAdminAction(adminId, 'adjust_economy', {
    entityType: 'user',
    entityId: Number(userId),
    details: { deltaPoints, deltaTokens, note, newPoints, newTokens }
  });

  return { userId, newPoints, newTokens };
}

export async function toggleAdmin(userId, adminId) {
  const user = await queryOne('SELECT id, is_admin FROM users WHERE id = $1', [userId]);
  if (!user) throw new AppError('User not found', 404);
  if (user.id === adminId) throw new AppError('You cannot change your own admin status', 400);

  const newVal = !user.is_admin;
  await query('UPDATE users SET is_admin = $2 WHERE id = $1', [userId, newVal]);

  await logAdminAction(adminId, newVal ? 'grant_admin' : 'revoke_admin', {
    entityType: 'user',
    entityId: Number(userId)
  });

  return { userId, isAdmin: newVal };
}

export default {
  getDashboardStats,
  getUsers,
  getUserDetails,
  banUser,
  unbanUser,
  getReports,
  getReportDetails,
  resolveReport,
  getAnalytics,
  logAdminAction,
  getVerificationRequests,
  getVerificationRequestById,
  decideVerificationRequest,
  adjustUserEconomy,
  toggleAdmin
};