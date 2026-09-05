import { query, queryOne, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as pointsService from './pointsService.js';
import * as notificationsService from './notificationsService.js';

/**
 * Tips — send points and/or DUYS to another user.
 * Ported from legacy `DUYS/duys/routes/wallet.py` tip routes.
 *
 * Presets: 10 / 50 / 100 / 500 points (or 1 / 5 / 10 / 50 DUYS when useDuys=true).
 */

export const TIP_PRESETS_POINTS = [10, 50, 100, 500];
export const TIP_PRESETS_DUYS = [1, 5, 10, 50];

/**
 * Send a tip to another user.
 * @param {number} senderId
 * @param {number} recipientId
 * @param {number} amount  tip amount (points unless useDuys=true)
 * @param {string} message optional ≤280 chars
 * @param {boolean} useDuys tip in DUYS tokens instead of points
 */
export async function sendTip(senderId, recipientId, amount, message = '', useDuys = false) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new AppError('Invalid tip amount', 400);
  if (senderId === recipientId) throw new AppError('You cannot tip yourself', 400);
  if (String(message).length > 280) throw new AppError('Message too long (max 280)', 400);

  const recipient = await queryOne('SELECT id, username, display_name FROM users WHERE id = $1', [recipientId]);
  if (!recipient) throw new AppError('Recipient not found', 404);

  // Reject self-tip again via PK.
  if (recipient.id === senderId) throw new AppError('You cannot tip yourself', 400);

  let tipRecord;
  if (useDuys) {
    // Round to 6dp.
    const rounded = Math.round(amt * 1e6) / 1e6;
    const ok = await pointsService.spendTokens(senderId, rounded, 'tip_out', String(recipientId));
    if (!ok) throw new AppError('Insufficient DUYS balance', 400);
    await pointsService.creditTokens(recipientId, rounded, 'tip_in', String(senderId));

    tipRecord = await queryOne(
      `INSERT INTO tips (sender_id, recipient_id, amount_duys, message)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [senderId, recipientId, rounded, String(message || '')]
    );
  } else {
    const pointsAmount = Math.floor(amt);
    const ok = await pointsService.transferPoints(senderId, recipientId, pointsAmount, 'tip');
    if (!ok) throw new AppError('Insufficient points', 400);

    tipRecord = await queryOne(
      `INSERT INTO tips (sender_id, recipient_id, amount_points, message)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [senderId, recipientId, pointsAmount, String(message || '')]
    );
  }

  notificationsService.createNotification({
    userId: recipientId,
    actorId: senderId,
    kind: 'payment',
    title: useDuys
      ? `You received a tip of ${tipRecord.amount_duys} DUYS!`
      : `You received a tip of ${tipRecord.amount_points} points!`,
    message: String(message || ''),
    entityType: null,
    entityId: null
  }).catch(() => {});

  return { ok: true, tip: tipRecord };
}

/** Recent tips sent by / received by a user. */
export async function getTipHistory(userId, limit = 50) {
  const sent = await queryAll(
    `SELECT t.*, u.username AS to_username, u.display_name AS to_display
     FROM tips t JOIN users u ON u.id = t.recipient_id
     WHERE t.sender_id = $1 ORDER BY t.id DESC LIMIT $2`,
    [userId, limit]
  );
  const received = await queryAll(
    `SELECT t.*, u.username AS from_username, u.display_name AS from_display
     FROM tips t JOIN users u ON u.id = t.sender_id
     WHERE t.recipient_id = $1 ORDER BY t.id DESC LIMIT $2`,
    [userId, limit]
  );
  return { sent, received };
}

export default { TIP_PRESETS_POINTS, TIP_PRESETS_DUYS, sendTip, getTipHistory };