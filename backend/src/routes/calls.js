/**
 * Call signaling routes — WebRTC offer/answer/ICE relay.
 * The server only relays signaling payloads (no media processing).
 */
import express from 'express';
import { queryOne, queryAll } from '../config/database.js';
import callsService from '../services/callsService.js';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../services/socket.js';

const router = express.Router();

/**
 * POST /calls
 * Initiate a call (1:1 conversation or live room).
 * Body: { conversationId?, roomId?, kind: 'voice'|'video' }
 */
router.post('/', async (req, res) => {
  const { conversationId, roomId, kind = 'voice' } = req.body;

  if (!conversationId && !roomId) {
    return res.status(400).json({ error: 'conversationId or roomId required' });
  }

  try {
    // For conversation calls, find the other participant
    let callees = [];
    if (conversationId) {
      const conv = await queryOne(
        'SELECT participant_1_id, participant_2_id FROM conversations WHERE id = $1',
        [conversationId]
      );
      if (!conv) throw new AppError('Conversation not found', 404);
      const otherId = Number(req.userId) === conv.participant_1_id
        ? conv.participant_2_id
        : conv.participant_1_id;
      callees = [otherId];
    } else if (roomId) {
      // For room calls, call all viewers + host
      const hostRow = await queryOne('SELECT host_id FROM rooms WHERE id = $1', [roomId]);
      if (!hostRow) throw new AppError('Room not found', 404);
      const viewerRows = await queryAll(
        'SELECT DISTINCT user_id FROM room_messages WHERE room_id = $1 AND user_id != $2',
        [roomId, req.userId]
      );
      const allIds = new Set([hostRow.host_id, ...viewerRows.map((r) => r.user_id)]);
      allIds.delete(Number(req.userId));
      callees = Array.from(allIds);
    }

    const call = await callsService.createCall({
      conversationId, roomId, callerId: req.userId, callees, kind
    });

    // Signal the callees via socket
    callees.forEach((calleeId) => {
      getIO()?.to(`user:${calleeId}`).emit('call:incoming', {
        callId: call.id,
        callerId: req.userId,
        kind: call.kind,
        conversationId,
        roomId
      });
    });

    res.status(201).json(call);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /calls/:callId/accept
 */
router.post('/:callId/accept', async (req, res) => {
  const { callId } = req.params;
  try {
    if (!(await callsService.isCallMember(callId, req.userId))) {
      return res.status(403).json({ error: 'Not a member of this call' });
    }
    await callsService.setStatus(callId, 'active');
    res.json({ accepted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /calls/:callId/decline
 */
router.post('/:callId/decline', async (req, res) => {
  const { callId } = req.params;
  try {
    if (!(await callsService.isCallMember(callId, req.userId))) {
      return res.status(403).json({ error: 'Not a member of this call' });
    }
    await callsService.setStatus(callId, 'declined');
    res.json({ declined: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /calls/:callId/end
 */
router.post('/:callId/end', async (req, res) => {
  const { callId } = req.params;
  try {
    if (!(await callsService.isCallMember(callId, req.userId))) {
      return res.status(403).json({ error: 'Not a member of this call' });
    }
    await callsService.setStatus(callId, 'ended');
    getIO()?.to(`call:${callId}`).emit('call:ended', { callId });
    res.json({ ended: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /calls/:callId/signal
 * Relay a WebRTC signal to specific users.
 * Body: { to: number, signal: object }
 */
router.post('/:callId/signal', async (req, res) => {
  const { callId } = req.params;
  const { to, signal } = req.body;

  if (!to || !signal) return res.status(400).json({ error: 'to and signal required' });

  try {
    if (!(await callsService.isCallMember(callId, req.userId))) {
      return res.status(403).json({ error: 'Not a member of this call' });
    }

    // Deliver via socket
    getIO()?.to(`user:${to}`).emit('call:signal', {
      from: req.userId,
      callId,
      signal
    });

    // Also persist to DB for offline delivery
    await callsService.enqueue(to, {
      call_id: callId,
      from: req.userId,
      type: 'signal',
      signal
    });

    res.json({ sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /calls/:callId/ring
 * Send ring notification to callees.
 */
router.post('/:callId/ring', async (req, res) => {
  const { callId } = req.params;
  try {
    if (!(await callsService.isCallMember(callId, req.userId))) {
      return res.status(403).json({ error: 'Not a member of this call' });
    }

    const others = await callsService.otherMembers(callId, req.userId);
    others.forEach((calleeId) => {
      getIO()?.to(`user:${calleeId}`).emit('call:ring', { callId });
    });

    res.json({ rung: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /calls/:callId/ping
 * Check call status.
 */
router.get('/:callId/ping', async (req, res) => {
  const { callId } = req.params;
  try {
    const call = await queryOne(
      'SELECT id, status, caller_id, conversation_id, room_id, kind, created_at, ended_at FROM calls WHERE id = $1',
      [callId]
    );
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json(call);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;