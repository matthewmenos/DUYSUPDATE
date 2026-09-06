import crypto from 'crypto';
import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * WebRTC call signaling service — server acts as a message relay only
 * (no media proxying, no TURN/STUN). Uses PostgreSQL for the signaling
 * queue so calls survive server restarts.
 *
 * Schema: calls, call_signals.
 */

/**
 * Create a new call.
 * @param {number} conversationId - The conversation or room this call belongs to.
 * @param {number} callerId - User initiating the call.
 * @param {number[]} callees - User IDs being called.
 * @param {string} kind - 'voice' or 'video'.
 * @param {string} [context='conversation'] - 'conversation' or 'room'.
 */
export async function createCall({ conversationId, roomId, callerId, callees, kind = 'voice' }) {
  const callId = crypto.randomBytes(8).toString('hex');

  const result = await query(
    `INSERT INTO calls (id, conversation_id, room_id, caller_id, kind, status)
     VALUES ($1, $2, $3, $4, $5, 'ringing')
     RETURNING id, conversation_id, room_id, caller_id, kind, status, created_at`,
    [callId, conversationId || null, roomId || null, callerId, kind]
  );

  return result.rows[0];
}

/**
 * Check if a user is a member of a call.
 */
export async function isMember(callId, userId) {
  const call = await queryOne(
    `SELECT c.id FROM calls c
     LEFT JOIN conversations conv ON c.conversation_id = conv.id
     LEFT JOIN rooms r ON c.room_id = r.id
     WHERE c.id = $1
       AND (
         ($1::text IS NOT NULL AND conv.room_id IS NOT NULL AND r.host_id = $2)
         OR (conv.id IS NOT NULL AND ($2 = conv.participant_1_id OR $2 = conv.participant_2_id))
         OR (r.id IS NOT NULL AND ($2 = r.host_id OR EXISTS(
           SELECT 1 FROM room_messages WHERE room_id = r.id AND user_id = $2
         )))
       )`,
    [callId, userId]
  );
  return !!call;
}

/**
 * Simplified membership check — verifies the user participated in the call
 * via the conversation or room membership table.
 */
export async function isCallMember(callId, userId) {
  return queryOne('SELECT 1 FROM calls WHERE id = $1 AND caller_id = $2', [callId, userId])
    || queryOne(
      `SELECT 1 FROM calls c
       JOIN conversations conv ON c.conversation_id = conv.id
       WHERE c.id = $1 AND (conv.participant_1_id = $2 OR conv.participant_2_id = $2)`,
      [callId, userId]
    )
    || queryOne(
      `SELECT 1 FROM calls c
       JOIN rooms r ON c.room_id = r.id
       WHERE c.id = $1 AND (r.host_id = $2 OR EXISTS(
         SELECT 1 FROM room_messages WHERE room_id = r.id AND user_id = $2
       ))`,
      [callId, userId]
    );
}

/**
 * Set call status (e.g., 'active' after accept, 'ended', 'declined').
 */
export async function setStatus(callId, status) {
  if (!['ringing', 'active', 'ended', 'declined'].includes(status)) {
    throw new AppError('Invalid call status', 400);
  }

  const result = await queryOne(
    `UPDATE calls SET status = $1, ended_at = CASE WHEN $1 IN ('ended', 'declined') THEN NOW() ELSE ended_at END
     WHERE id = $1
     RETURNING id, status, ended_at`,
    [callId, status, status]
  );

  return result;
}

/**
 * Get all other members in a call (for broadcasting signals).
 */
export async function otherMembers(callId, userId) {
  const call = await queryOne('SELECT * FROM calls WHERE id = $1', [callId]);
  if (!call) return [];

  const members = new Set([call.caller_id]);

  if (call.conversation_id) {
    const conv = await queryOne('SELECT participant_1_id, participant_2_id FROM conversations WHERE id = $1',
      [call.conversation_id]);
    if (conv) {
      members.add(conv.participant_1_id);
      members.add(conv.participant_2_id);
    }
  }

  if (call.room_id) {
    const room = await queryOne('SELECT host_id FROM rooms WHERE id = $1', [call.room_id]);
    if (room) members.add(room.host_id);
    const viewerIds = await queryAll(
      'SELECT user_id FROM room_messages WHERE room_id = $1 AND user_id != $2',
      [call.room_id, userId]
    );
    viewerIds.forEach((r) => members.add(r.user_id));
  }

  members.delete(Number(userId));
  return Array.from(members);
}

/**
 * Enqueue a signal for a specific user on a call.
 */
export async function enqueue(userId, payload) {
  // Signals reference the call so we can match later; store call_id if present
  const callId = payload.call_id || null;
  await query(
    `INSERT INTO call_signals (call_id, from_user_id, to_user_id, kind, data, delivered)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [callId, payload.from || null, userId, payload.type || 'signal', JSON.stringify(payload)]
  );
}

/**
 * Drain all pending (undelivered) signals for a user.
 * For WebRTC signaling, we use the in-memory queue via enqueue/poll,
 * but also persist to call_signals for persistence.
 */
export async function drain(userId) {
  const rows = await query(
    `SELECT cs.id, cs.call_id, cs.kind, cs.data, cs.from_user_id
     FROM call_signals cs
     WHERE cs.to_user_id = $1 AND cs.delivered = false
     ORDER BY cs.emitted_at ASC`,
    [userId]
  );

  if (rows.rows.length > 0) {
    const ids = rows.rows.map((r) => r.id);
    await query('UPDATE call_signals SET delivered = true WHERE id = ANY($1)', [ids]);
  }

  return rows.rows.map((r) => ({
    type: r.kind,
    call_id: r.call_id,
    from: r.from_user_id,
    signal: r.data ? JSON.parse(r.data).signal : null
  }));
}

export default {
  createCall,
  isCallMember,
  setStatus,
  otherMembers,
  enqueue,
  drain
};