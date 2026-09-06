import crypto from 'crypto';
import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Live streaming service.
 * Viewer presence is tracked via the `current_viewers` counter on the rooms
 * table (there is no room_viewers table in the schema), and chat lives in
 * `room_messages` (column `body`).
 */

/**
 * Create a live room and generate an RTMP stream key for the host.
 */
export async function createLiveRoom(userId, { title = '', kind = 'video' }) {
  const streamKey = crypto.randomBytes(16).toString('hex');

  const result = await query(
    `INSERT INTO rooms (host_id, kind, title, status)
     VALUES ($1, $2, $3, 'live')
     RETURNING *`,
    [userId, kind, title]
  );

  const room = result.rows[0];
  return {
    ...room,
    streamKey,
    rtmpUrl: process.env.RTMP_URL || 'rtmp://localhost:1935/live'
  };
}

/**
 * Get all active (live) rooms, ordered by current viewers.
 */
export async function getActiveLiveRooms(limit = 20, offset = 0) {
  return queryAll(
    `SELECT r.*, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM rooms r
     JOIN users u ON r.host_id = u.id
     WHERE r.status = 'live' AND u.is_banned = false
     ORDER BY r.current_viewers DESC, r.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

/**
 * Get a single room with host info and viewer count.
 */
export async function getRoomById(roomId) {
  return queryOne(
    `SELECT r.*, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM rooms r
     JOIN users u ON r.host_id = u.id
     WHERE r.id = $1`,
    [roomId]
  );
}

/**
 * End a live stream. Only the host may end it.
 */
export async function endLiveRoom(roomId, userId) {
  const room = await queryOne('SELECT * FROM rooms WHERE id = $1', [roomId]);
  if (!room) {
    throw new AppError('Room not found', 404);
  }
  if (room.host_id !== parseInt(userId, 10)) {
    throw new AppError('Only the host can end this stream', 403);
  }

  return queryOne(
    `UPDATE rooms SET status = 'ended', ended_at = NOW() WHERE id = $1 RETURNING *`,
    [roomId]
  );
}

/**
 * Track a viewer joining a live room (increments current_viewers + peak).
 */
export async function addRoomViewer(roomId, userId) {
  const room = await queryOne(
    `SELECT id FROM rooms WHERE id = $1 AND status = 'live'`,
    [roomId]
  );
  if (!room) {
    throw new AppError('Room not found or not live', 404);
  }

  const updated = await queryOne(
    `UPDATE rooms
     SET current_viewers = current_viewers + 1,
         viewer_peak = GREATEST(viewer_peak, current_viewers + 1)
     WHERE id = $1
     RETURNING current_viewers`,
    [roomId]
  );

  return { viewerCount: updated.current_viewers };
}

/**
 * Track a viewer leaving a live room (decrements current_viewers, min 0).
 */
export async function removeRoomViewer(roomId, userId) {
  const updated = await queryOne(
    `UPDATE rooms
     SET current_viewers = GREATEST(current_viewers - 1, 0)
     WHERE id = $1
     RETURNING current_viewers`,
    [roomId]
  );

  return { viewerCount: updated ? updated.current_viewers : 0 };
}

/**
 * Insert a chat message and return it with user info.
 */
export async function sendRoomMessage(roomId, userId, message) {
  const room = await queryOne('SELECT id FROM rooms WHERE id = $1', [roomId]);
  if (!room) {
    throw new AppError('Room not found', 404);
  }

  const result = await query(
    `INSERT INTO room_messages (room_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, room_id, user_id, body, created_at`,
    [roomId, userId, message]
  );

  return queryOne(
    `SELECT m.*, u.username, u.display_name, u.avatar_url
     FROM room_messages m
     JOIN users u ON m.user_id = u.id
     WHERE m.id = $1`,
    [result.rows[0].id]
  );
}

/**
 * Get chat history for a room, newest first, cursor (beforeId) paginated.
 */
export async function getRoomMessages(roomId, limit = 50, beforeId = null) {
  const query = `
    SELECT m.*, u.username, u.display_name, u.avatar_url
    FROM room_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.room_id = $1
    ${beforeId ? 'AND m.id < $2' : ''}
    ORDER BY m.id DESC
    LIMIT $${beforeId ? '3' : '2'}
  `;
  const params = beforeId ? [roomId, beforeId, limit] : [roomId, limit];
    return queryAll(query, params);
}

// ============================================================================
// Live Spaces depth: hearts, speakers, signals
// ============================================================================

export async function sendHeart(roomId, userId) {
  await query(
    `INSERT INTO room_hearts (room_id, user_id, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (room_id, user_id) DO UPDATE SET count = room_hearts.count + 1`,
    [roomId, userId]
  );
  return { sent: true };
}

export async function getHearts(roomId) {
  const row = await queryOne('SELECT SUM(count) AS total FROM room_hearts WHERE room_id = $1',
    [roomId]);
  return { total: row ? Number(row.total || 0) : 0 };
}

export async function addSpeaker(roomId, userId) {
  await query('INSERT INTO room_speakers (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, userId]);
  return { added: true };
}

export async function removeSpeaker(roomId, userId) {
  await query('DELETE FROM room_speakers WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  return { removed: true };
}

export async function getSpeakers(roomId) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM room_speakers rs JOIN users u ON u.id = rs.user_id
     WHERE rs.room_id = $1`,
    [roomId]
  );
}

export async function addSpeakRequest(roomId, targetId) {
  await query('INSERT INTO room_speakers (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, targetId]);
  return { requested: true };
}

export async function getSpeakRequests(roomId) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM room_speakers rs JOIN users u ON u.id = rs.user_id
     WHERE rs.room_id = $1`,
    [roomId]
  );
}

export async function acceptSpeakRequest(roomId, targetId) {
  return { accepted: true };
}

export async function addJoinRequest(roomId, targetId) {
  await query('INSERT INTO room_speakers (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, targetId]);
  return { requested: true };
}

export async function getJoinRequests(roomId) {
  return getSpeakers(roomId);
}

export async function acceptJoinRequest(roomId, targetId) {
  return { accepted: true };
}

export async function pushSignal(roomId, userId, { from, signal }) {
  const { queryOne: q1 } = await import('../config/database.js');
  const call = await q1('SELECT id FROM calls WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1',
    [roomId]);

  await query(
    `INSERT INTO call_signals (call_id, from_user_id, to_user_id, kind, data, delivered)
     VALUES ($1, $2, $3, 'signal', $4, false)`,
    [call?.id || null, from, userId, JSON.stringify({ signal })]
  );
  getIO()?.to(`room:${roomId}`).emit('room:signal', { from, signal });
}

export async function popSignals(roomId, userId) {
  await query(
    `UPDATE call_signals cs SET delivered = true
     FROM calls c WHERE cs.call_id = c.id AND c.room_id = $1
     AND cs.to_user_id = $2 AND cs.delivered = false`,
    [roomId, userId]
  );

  const rows = await queryAll(
    `SELECT cs.from_user_id AS from, cs.data
     FROM call_signals cs JOIN calls c ON c.id = cs.call_id
     WHERE c.room_id = $1 AND cs.to_user_id = $2 AND cs.delivered = true
     ORDER BY cs.emitted_at ASC`,
    [roomId, userId]
  );

  return rows.map((r) => {
    let signal = null;
    try { signal = JSON.parse(r.data)?.signal || null; } catch { signal = null; }
    return { from: r.from, signal };
  });
}

export async function getGuests(roomId) {
  return queryAll(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified_badge
     FROM room_speakers rs JOIN users u ON u.id = rs.user_id
     WHERE rs.room_id = $1`,
    [roomId]
  );
}

export async function getPresenceIds(roomId) {
  const rows = await queryAll(
    'SELECT DISTINCT user_id FROM room_messages WHERE room_id = $1',
    [roomId]
  );
  return rows.map((r) => r.user_id);
}

export async function getViewerIds(roomId) {
  return getPresenceIds(roomId);
}

export default {
  createLiveRoom,
  getActiveLiveRooms,
  getRoomById,
  endLiveRoom,
  addRoomViewer,
  removeRoomViewer,
  sendRoomMessage,
  getRoomMessages,
  // Live Spaces depth
  sendHeart,
  getHearts,
  addSpeaker,
  removeSpeaker,
  getSpeakers,
  addSpeakRequest,
  getSpeakRequests,
  acceptSpeakRequest,
  addJoinRequest,
  getJoinRequests,
  acceptJoinRequest,
  pushSignal,
  popSignals,
  getGuests,
  getPresenceIds,
  getViewerIds
};