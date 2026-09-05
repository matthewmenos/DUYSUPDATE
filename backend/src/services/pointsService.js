import { query, queryOne, queryAll, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * $DUYS points economy — awarding, spending, tips and the referral cut.
 * Ported from legacy DUYS `services/points.py` + `services/tokens.py`.
 */

// ── app_config helpers ────────────────────────────────────────────────────────

export async function getSetting(key, fallback = null) {
  try {
    const row = await queryOne('SELECT value FROM app_config WHERE key = $1', [key]);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

export async function getSettingBool(key, fallback = false) {
  const v = await getSetting(key, null);
  if (v === null) return fallback;
  return String(v).toLowerCase() === 'true' || v === '1';
}

export async function getSettingNum(key, fallback = 0) {
  const v = await getSetting(key, null);
  if (v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Points balance & ledger ──────────────────────────────────────────────────

export async function getPointsBalance(userId) {
  const row = await queryOne('SELECT points FROM users WHERE id = $1', [userId]);
  return row ? Number(row.points || 0) : 0;
}

export async function getPointLedger(userId, limit = 50, offset = 0) {
  return queryAll(
    `SELECT id, delta, reason, ref, created_at
     FROM point_ledger
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
}

async function recordLedger(client, userId, delta, reason, ref = '') {
  await client.query(
    `INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, $3, $4)`,
    [userId, delta, reason, ref || '']
  );
}

/**
 * Award points, applying the referrer's earnings cut automatically.
 */
export async function awardPoints(userId, amount, reason, ref = '', applyReferralCut = true) {
  if (!Number.isFinite(amount) || amount <= 0) return getPointsBalance(userId);

  const percent = await getSettingNum('referral_earn_percent', 0.01);
  let referrer = null;
  if (applyReferralCut && percent > 0) {
    const row = await queryOne('SELECT referred_by FROM users WHERE id = $1', [userId]);
    if (row && row.referred_by) referrer = row.referred_by;
  }

  await transaction(async (client) => {
    await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [amount, userId]);
    await recordLedger(client, userId, amount, reason, ref);

    if (referrer) {
      const cut = Math.floor(amount * percent);
      if (cut > 0) {
        await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [cut, referrer]);
        await recordLedger(client, referrer, cut, 'referral_earn_cut', `from:${userId}`);
      }
    }
  });

  return getPointsBalance(userId);
}

/**
 * Spend points if the user has enough. Returns true on success.
 */
export async function spendPoints(userId, amount, reason, ref = '') {
  if (!Number.isFinite(amount) || amount <= 0) return true;

  let committed = false;
  await transaction(async (client) => {
    const res = await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1',
      [Math.floor(amount), userId]
    );
    if (res.rowCount === 0) {
      throw new AppError('Insufficient points', 400);
    }
    await recordLedger(client, userId, -Math.floor(amount), reason, ref);
    committed = true;
  }).catch((err) => {
    if (err instanceof AppError) throw err;
    throw err;
  });

  return committed;
}

/**
 * Move points between users atomically (tips). Returns true on success.
 */
export async function transferPoints(fromId, toId, amount, reason, ref = '') {
  if (amount <= 0 || fromId === toId) return false;
  try {
    await spendPoints(fromId, amount, `${reason}_out`, ref || String(toId));
  } catch {
    return false;
  }
  await awardPoints(toId, amount, `${reason}_in`, ref || String(fromId), false);
  return true;
}

// ── DUYS token ledger (credit/spend with point_ledger) ───────────────────────

export async function getTokenBalance(userId) {
  const row = await queryOne('SELECT duys_tokens FROM users WHERE id = $1', [userId]);
  return row ? Number(row.duys_tokens || 0) : 0;
}

export async function creditTokens(userId, amount, reason, ref = '') {
  if (!Number.isFinite(amount) || amount <= 0) return getTokenBalance(userId);
  await query('UPDATE users SET duys_tokens = duys_tokens + $1 WHERE id = $2', [amount, userId]);
  await query(
    'INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, $3, $4)',
    [userId, amount, reason, ref || '']
  );
  return getTokenBalance(userId);
}

export async function spendTokens(userId, amount, reason, ref = '') {
  if (!Number.isFinite(amount) || amount <= 0) return true;
  const res = await query(
    'UPDATE users SET duys_tokens = duys_tokens - $1 WHERE id = $2 AND duys_tokens >= $1',
    [amount, userId]
  );
  if (res.rowCount === 0) return false;
  await query(
    'INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, $3, $4)',
    [userId, -amount, reason, ref || '']
  );
  return true;
}

export default {
  getSetting, getSettingBool, getSettingNum,
  getPointsBalance, getPointLedger,
  awardPoints, spendPoints, transferPoints,
  getTokenBalance, creditTokens, spendTokens
};