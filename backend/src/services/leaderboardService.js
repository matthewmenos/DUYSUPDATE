import { query, queryOne, queryAll } from '../config/database.js';

/**
 * $DUYS points leaderboard — ported from legacy
 * `DUYS/duys/routes/leaderboard.py`.
 */

export async function getLeaderboard(userId, limit = 100) {
  const top = await queryAll(
    `SELECT id, username, display_name, avatar_url, verified_badge, points
     FROM users
     WHERE is_banned = false
     ORDER BY points DESC, id ASC
     LIMIT $1`,
    [limit]
  );

  // Current user's rank (1-based).
  const me = await queryOne('SELECT points FROM users WHERE id = $1', [userId]);
  const myPoints = me ? Number(me.points || 0) : 0;
  const higher = await queryOne(
    'SELECT COUNT(*)::int AS c FROM users WHERE is_banned = false AND points > $1',
    [myPoints]
  );

  return {
    top: top.map((r) => ({ ...r, points: Number(r.points || 0) })),
    myRank: (higher?.c || 0) + 1,
    myPoints
  };
}

export default { getLeaderboard };