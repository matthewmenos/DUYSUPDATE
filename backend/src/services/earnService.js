import crypto from 'node:crypto';
import { query, queryOne, queryAll, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as pointsService from './pointsService.js';
import * as notificationsService from './notificationsService.js';

/**
 * Earn / Airdrop — reward $DUYS points for watching HypeLab rewarded ads,
 * plus the points -> DUYS token claim flow. Ported from legacy
 * `DUYS/duys/routes/earn.py` + `config.py` constants.
 */

const CLAIM_POINTS_PER_TOKEN_DEFAULT = 10;
const CLAIM_MIN_POINTS_DEFAULT = 100;
const CLAIM_MAX_DAILY_DEFAULT = 1;
const CLAIM_MAX_DAILY_VERIFIED_DEFAULT = 3;

// ── Ad rewards ───────────────────────────────────────────────────────────────

export async function adReward() {
  return pointsService.getSettingNum('points_ad_reward', 10);
}

export async function dailyAdCap() {
  return pointsService.getSettingNum('daily_ad_cap', 50);
}

/** Today's completed ad views + lifetime earnings for a user. */
export async function adStats(userId) {
  const todayRow = await queryOne(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(reward),0)::int AS s
     FROM ad_views WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
    [userId]
  );
  const totalRow = await queryOne(
    'SELECT COALESCE(SUM(reward),0)::int AS s FROM ad_views WHERE user_id = $1',
    [userId]
  );
  return {
    todayCount: todayRow ? todayRow.c : 0,
    todayReward: todayRow ? todayRow.s : 0,
    totalEarned: totalRow ? totalRow.s : 0
  };
}

export async function claimStats(userId) {
  const todayRow = await queryOne(
    `SELECT COUNT(*)::int AS c FROM token_claims
     WHERE user_id = $1 AND status = 'confirmed' AND created_at >= CURRENT_DATE`,
    [userId]
  );
  return {
    todayClaims: todayRow ? todayRow.c : 0
  };
}

/** Verify the HypeLab S2S HMAC signature (fail closed). */
export function verifyHypelabSignature(rawBody, sigHeader, secret) {
  if (!secret || !sigHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = String(sigHeader || '').toLowerCase();
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(received, 'utf8')
  );
}
/**
 * Credit a rewarded-ad completion idempotently.
 * - Daily cap is enforced *before* claiming so a redelivery after midnight works.
 * - Duplicate event_id is treated as already-seen (returns duplicate:true).
 */
export async function creditHypelabEvent(eventId, userId, reward) {
  const cap = await dailyAdCap();
  const todayCount = await queryOne(
    'SELECT COUNT(*)::int AS c FROM ad_views WHERE user_id = $1 AND created_at >= CURRENT_DATE',
    [userId]
  );
  if ((todayCount?.c || 0) >= cap) {
    return { ok: false, error: 'daily_cap_reached' };
  }

  let claimed = false;
  let duplicate = false;
  await transaction(async (client) => {
    const claim = await client.query(
      `INSERT INTO hypelab_events (event_id, user_id, reward) VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [eventId, userId, reward]
    );
    if (!claim.rows[0]) {
      duplicate = true;
      return;
    }
    await client.query(
      'INSERT INTO ad_views (user_id, reward) VALUES ($1, $2)',
      [userId, reward]
    );
    claimed = true;
  });

  if (claimed) {
    await pointsService.awardPoints(userId, reward, 'hypelab_rewarded_ad', eventId);
    await notificationsService.createNotification({
      userId,
      actorId: userId,
      kind: 'system',
      title: `You earned ${reward} $DUYS for watching an ad! 🎉`,
      message: '',
      entityType: 'system',
      entityId: null
    }).catch(() => {});
    return { ok: true };
  }

  if (duplicate) return { ok: true, duplicate: true };
  return { ok: false, error: 'claim_failed' };
}

// ── Points -> DUYS claims ────────────────────────────────────────────────────

export async function claimInfo(userId) {
  const points = await pointsService.getPointsBalance(userId);
  const perToken = await pointsService.getSettingNum('claim_points_per_token', CLAIM_POINTS_PER_TOKEN_DEFAULT);
  const minPoints = await pointsService.getSettingNum('claim_min_points', CLAIM_MIN_POINTS_DEFAULT);
  const claimablePts = Math.floor(points / perToken) * perToken;
  const claimableTokens = claimablePts / perToken;

  const user = await queryOne('SELECT verified_badge, wallet_address FROM users WHERE id = $1', [userId]);
  const maxDaily = user?.verified_badge
    ? await pointsService.getSettingNum('claim_max_daily_verified', CLAIM_MAX_DAILY_VERIFIED_DEFAULT)
    : await pointsService.getSettingNum('claim_max_daily', CLAIM_MAX_DAILY_DEFAULT);
  const todayClaimed = (await claimStats(userId)).todayClaims;
  const walletAddress = user?.wallet_address || '';

  return {
    points,
    perToken,
    minPoints,
    claimablePoints: claimablePts,
    claimableTokens,
    walletAddress,
    hasWallet: !!walletAddress,
    maxDaily,
    todayClaimed,
    canClaim: !!walletAddress && claimablePts >= minPoints && todayClaimed < maxDaily
  };
}

/**
 * Convert points to DUYS tokens (in-app balance credit).
 * Deducts points and credits duys_tokens with a ledger entry.
 */
export async function claimTokens(userId) {
  const info = await claimInfo(userId);
  if (!info.hasWallet) throw new AppError('Connect a wallet address first', 400);
  if (info.claimablePoints < info.minPoints) {
    throw new AppError(`Need at least ${info.minPoints} points to claim`, 400);
  }
  if (info.todayClaimed >= info.maxDaily) {
    throw new AppError('Daily claim limit reached', 400);
  }

  const tokens = info.claimablePoints / info.perToken;

  const created = await transaction(async (client) => {
    // Deduct points atomically (re-check minimum inside the lock).
    const res = await client.query(
      `UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points`,
      [info.claimablePoints, userId]
    );
    if (!res.rows[0]) throw new AppError('Insufficient points', 400);

    await client.query(
      `INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, 'token_claim_out', $3)`,
      [userId, -info.claimablePoints, `claim:${info.claimableTokens}`]
    );

    const claim = await client.query(
      `INSERT INTO token_claims (user_id, points_used, tokens, status)
       VALUES ($1, $2, $3, 'confirmed')
       RETURNING id, points_used, tokens, status, created_at`,
      [userId, info.claimablePoints, tokens]
    );
    return claim.rows[0];
  });

  // Credit DUYS balance after the atomic points deduction.
  await pointsService.creditTokens(userId, tokens, 'token_claim_in', `claim:${created.id}`);

  return {
    ok: true,
    claim: { ...created, tokens: Number(created.tokens) },
    balance: await pointsService.getTokenBalance(userId),
    points: await pointsService.getPointsBalance(userId)
  };
}

export default {
  adReward, dailyAdCap, adStats, claimStats,
  verifyHypelabSignature, creditHypelabEvent,
  claimInfo, claimTokens
};