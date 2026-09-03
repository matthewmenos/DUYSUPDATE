import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';

let io = null;

/**
 * Attach Socket.io to the HTTP server and set up live-room channels.
 * - Clients authenticate via socket.handshake.auth.token (JWT).
 * - Joining a room subscribes the socket to the `room:<id>` channel.
 * Server-side broadcasts (viewer counts, chat, stream ended) are emitted by
 * the REST routes via getIO().
 */
export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) {
      return next(new Error('Unauthorized'));
    }
    socket.userId = decoded.userId;
    next();
  });

  io.on('connection', (socket) => {
    // Join the user's personal room so DM broadcasts can reach them.
    socket.join(`user:${socket.userId}`);

    socket.on('live:join', (roomId) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('live:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // Join a direct-message conversation room for edits/deletes/typing.
    socket.on('dm:join', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('dm:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing indicator: relay to the other participant in the conversation.
    socket.on('dm:typing', ({ conversationId, recipientId }) => {
      socket.to(`user:${recipientId}`).emit('dm:typing', {
        conversationId,
        userId: socket.userId,
        isTyping: true
      });
    });

    socket.on('dm:stopTyping', ({ conversationId, recipientId }) => {
      socket.to(`user:${recipientId}`).emit('dm:typing', {
        conversationId,
        userId: socket.userId,
        isTyping: false
      });
    });

    socket.on('disconnect', () => {
      // Optional cleanup for presence tracking.
    });
  });

  return io;
}

/**
 * Get the Socket.io instance (null before initSocket is called).
 */
export function getIO() {
  return io;
}

export default { initSocket, getIO };