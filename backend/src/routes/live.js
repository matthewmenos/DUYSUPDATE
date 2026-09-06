import express from 'express';
import Joi from 'joi';
import * as liveService from '../services/liveService.js';
import { getIO } from '../services/socket.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /live
 * Create a live room (status='live') and return the RTMP stream key.
 */
router.post('/', async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().max(500).allow('').default(''),
    kind: Joi.string().valid('video', 'space').default('video')
  });

  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const room = await liveService.createLiveRoom(req.userId, value);
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /live?limit=&offset=
 * Get active live rooms ordered by viewers.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const rooms = await liveService.getActiveLiveRooms(limit, offset);
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /live/:roomId
 * Get room details + live viewer count.
 */
router.get('/:roomId', async (req, res) => {
  try {
    const room = await liveService.getRoomById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /live/:roomId/end
 * End the stream (host only) and notify viewers.
 */
router.post('/:roomId/end', async (req, res) => {
  try {
    const room = await liveService.endLiveRoom(req.params.roomId, req.userId);
    getIO()?.to(`room:${req.params.roomId}`).emit('live:ended', {
      roomId: parseInt(req.params.roomId, 10)
    });
    res.json(room);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /live/:roomId/join
 * Track a viewer joining and broadcast the new count.
 */
router.post('/:roomId/join', async (req, res) => {
  try {
    const { viewerCount } = await liveService.addRoomViewer(req.params.roomId, req.userId);
    getIO()?.to(`room:${req.params.roomId}`).emit('live:viewers', {
      roomId: parseInt(req.params.roomId, 10),
      viewerCount
    });
    res.json({ viewerCount });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /live/:roomId/leave
 * Track a viewer leaving and broadcast the new count.
 */
router.post('/:roomId/leave', async (req, res) => {
  try {
    const { viewerCount } = await liveService.removeRoomViewer(req.params.roomId, req.userId);
    getIO()?.to(`room:${req.params.roomId}`).emit('live:viewers', {
      roomId: parseInt(req.params.roomId, 10),
      viewerCount
    });
    res.json({ viewerCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /live/:roomId/message
 * Send a chat message and broadcast it to the room.
 */
router.post('/:roomId/message', async (req, res) => {
  const schema = Joi.object({
    message: Joi.string().min(1).max(2000).required()
  });

  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const msg = await liveService.sendRoomMessage(req.params.roomId, req.userId, value.message);
    getIO()?.to(`room:${req.params.roomId}`).emit('live:message', msg);
    res.status(201).json(msg);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /live/:roomId/messages?limit=&beforeId=
 * Get chat history (newest first, cursor paginated).
 */
router.get('/:roomId/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;

    const messages = await liveService.getRoomMessages(req.params.roomId, limit, beforeId);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /live/:roomId/heart
 * Send a heart (reaction) to the host — broadcast to the room.
 */
router.post('/:roomId/heart', async (req, res) => {
  try {
    const result = await liveService.sendHeart(req.params.roomId, req.userId);
    const { total } = await liveService.getHearts(req.params.roomId);
    getIO()?.to(`room:${req.params.roomId}`).emit('live:heart', {
      roomId: parseInt(req.params.roomId, 10),
      userId: req.userId,
      total
    });
    res.json({ ...result, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /live/:roomId/hearts
 * Get current hearts count.
 */
router.get('/:roomId/hearts', async (req, res) => {
  try {
    const result = await liveService.getHearts(req.params.roomId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /live/:roomId/speak
 * Request / accept to speak (host approves). Body: { action: 'request'|'accept'|'remove', targetUserId? }
 */
router.post('/:roomId/speak', async (req, res) => {
  const { action = 'request', targetUserId } = req.body;
  try {
    let result;
    if (action === 'request') {
      result = await liveService.addSpeaker(req.params.roomId, req.userId);
      getIO()?.to(`room:${req.params.roomId}`).emit('live:speak-request', {
        roomId: parseInt(req.params.roomId, 10),
        userId: req.userId
      });
    } else if (action === 'accept') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required for accept' });
      const room = await liveService.getRoomById(req.params.roomId);
      if (!room || Number(room.host_id) !== Number(req.userId)) {
        return res.status(403).json({ error: 'Only the host can accept speakers' });
      }
      result = await liveService.addSpeaker(req.params.roomId, targetUserId);
      getIO()?.to(`room:${req.params.roomId}`).emit('live:speak-accepted', {
        roomId: parseInt(req.params.roomId, 10),
        userId: targetUserId
      });
    } else if (action === 'remove') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId required for remove' });
      const room = await liveService.getRoomById(req.params.roomId);
      if (!room || Number(room.host_id) !== Number(req.userId)) {
        return res.status(403).json({ error: 'Only the host can remove speakers' });
      }
      result = await liveService.removeSpeaker(req.params.roomId, targetUserId);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /live/:roomId/speakers
 * List current speakers.
 */
router.get('/:roomId/speakers', async (req, res) => {
  try {
    const speakers = await liveService.getSpeakers(req.params.roomId);
    res.json({ speakers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
