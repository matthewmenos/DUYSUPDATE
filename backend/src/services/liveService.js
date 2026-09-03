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

export default {
  createLiveRoom,
  getActiveLiveRooms,
  getRoomById,
  endLiveRoom,
  addRoomViewer,
  removeRoomViewer,
  sendRoomMessage,
  getRoomMessages,
};