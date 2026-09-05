import { query, queryOne, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as pointsService from './pointsService.js';
import * as swapService from './swapService.js';

/**
 * Post boosting (Facebook-Ads style) with a Sponsored tag.
 * Ported from legacy `DUYS/duys/routes/boost.py`.
 * Priced in USD/day and charged in in-app DUYS at the live market rate.
 */

export const CTAS = ['Visit Site', 'Learn More', 'Shop Now', 'Sign Up', 'Book Now', 'Contact Us', 'Download'];

export async function boostFeeDuys(days) {
  const usdPerDay = Number(await pointsService.getSettingNum('fee_usd_boost_per_day', 1.0));
  const rate = await swapService.marketRate();
  return usdPerDay * days * rate;
}

/** Return the live DUYS cost per boost-day for the JS cost estimator. */
export async function boostRate() {
  const usdPerDay = Number(await pointsService.getSettingNum('fee_usd_boost_per_day', 1.0));
  const duysPerDay = await boostFeeDuys(1);
  return {
    ok: true,
    usd_per_day: usdPerDay,
    duys_per_day: Number(duysPerDay.toFixed(6)),
    rate_available: duysPerDay > 0
  };
}

/**
 * Boost a post owned by the current user.
 * Pays DUYS for `days` (1..30) and flags the post as sponsored.
 */
export async function boostPost(postId, userId, data) {
  const days = Math.max(1, Math.min(30, Number(data.days) || 1));
  const geo = String(data.geo || '').slice(0, 120);
  const audience = String(data.audience || '').slice(0, 200);
  let landingUrl = String(data.landingUrl || '').trim().slice(0, 300);
  let cta = String(data.cta || '').trim();
  if (!CTAS.includes(cta)) cta = '';
  const ageMin = Math.max(13, Math.min(99, Number(data.ageMin) || 18));
  const ageMax = Math.max(ageMin, Math.min(99, Number(data.ageMax) || 65));
  if (landingUrl && !/^https?:\/\//i.test(landingUrl)) landingUrl = 'https://' + landingUrl;

  const post = await queryOne('SELECT id, author_id FROM posts WHERE id = $1 AND deleted_at IS NULL', [postId]);
  if (!post || post.author_id !== userId) throw new AppError('Forbidden', 403);

  const cost = await boostFeeDuys(days);
  if (cost <= 0) throw new AppError('Live rate unavailable — try again shortly.', 503);

  const ok = await pointsService.spendTokens(userId, cost, 'boost', String(postId));
  if (!ok) throw new AppError('Insufficient tokens', 400);

  // Set or extend the boost.
  const existing = await queryOne(
    'SELECT id, ends_at FROM boosts WHERE post_id = $1 AND status IN ($2, $3) ORDER BY id DESC LIMIT 1',
    [postId, 'active', 'pending']
  );
  let endsAt;
  if (existing && existing.ends_at && new Date(existing.ends_at) > new Date()) {
    const base = new Date(existing.ends_at);
    base.setUTCDate(base.getUTCDate() + days);
    endsAt = base;
  } else {
    endsAt = new Date();
    endsAt.setUTCDate(endsAt.getUTCDate() + days);
  }

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO boosts (post_id, advertiser_id, budget, spent, status, cta, landing_url, starts_at, ends_at)
       VALUES ($1, $2, $3, $3, 'active', $4, $5, NOW(), $6)`,
      [postId, userId, cost, cta, landingUrl, endsAt]
    );
    await client.query(
      `UPDATE posts SET is_sponsored = true, boost_until = $1, cta = $2, landing_url = $3 WHERE id = $4`,
      [endsAt, cta, landingUrl, postId]
    );
  });

  return { ok: true, boost_until_days: days, cost, endsAt };
}

export default { CTAS, boostFeeDuys, boostRate, boostPost };