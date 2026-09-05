import { query, queryOne, queryAll } from '../config/database.js';
import * as pointsService from './pointsService.js';

/**
 * Referral program — a user's username is their referral code.
 * Ported from legacy `DUYS/duys/routes/referral.py`.
 *
 * Note: the unified schema's `referrals` table stores referrer+referred_user
 * (reward_given / reward_redeemed), so we resolve referred users from there.
 */

export async function getReferralInfo(userId) {
  const user = await queryOne(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
    [userId]
  );

  const referrals = await queryAll(
    `SELECT r.created_at, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM referrals r
     JOIN users u ON u.id = r.referred_user_id
     WHERE r.referrer_id = $1
     ORDER BY r.id DESC`,
    [userId]
  );

  const earnedRow = await queryOne(
    `SELECT COALESCE(SUM(delta),0)::numeric AS s FROM point_ledger
     WHERE user_id = $1 AND reason IN ('referral_bonus', 'referral_earn_cut')`,
    [userId]
  );

  const bonus = await pointsService.getSettingNum('points_referral_bonus', 100);
  const percentRaw = await pointsService.getSettingNum('referral_earn_percent', 0.01);
  const percent = Math.round(percentRaw * 100);

  const origin = process.env.FRONTEND_URL || process.env.APP_URL || 'https://duys.app';
  const link = `${origin}/login?ref=${user.username}`;

  return {
    code: user.username,
    link,
    displayName: user.display_name,
    referrals,
    totalEarned: earnedRow ? Number(earnedRow.s) : 0,
    bonus,
    percent
  };
}

/** Total referral bonus earned (used by wallet summary). */
export async function referralEarnings(userId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(delta),0)::numeric AS s FROM point_ledger
     WHERE user_id = $1 AND reason IN ('referral_bonus', 'referral_earn_cut')`,
    [userId]
  );
  return row ? Number(row.s) : 0;
}

export default { getReferralInfo, referralEarnings };