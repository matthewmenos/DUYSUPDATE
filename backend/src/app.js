import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import 'express-async-errors';
import dotenv from 'dotenv';

import { pool } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticateJWT, requireAdmin } from './middleware/auth.js';

// Routes
import authRoutes from './routes/auth.js';
import auth2faRoutes from './routes/auth2fa.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import feedRoutes from './routes/feed.js';
import storyRoutes from './routes/stories.js';
import liveRoutes from './routes/live.js';
import messagingRoutes from './routes/messaging.js';
import channelRoutes from './routes/channels.js';
import walletRoutes from './routes/wallet.js';
import notificationRoutes from './routes/notifications.js';
import verificationRoutes from './routes/verification.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/auth', authRoutes);
app.use('/auth', auth2faRoutes);
app.use('/verify', verificationRoutes);

// Protected routes
app.use('/users', authenticateJWT, userRoutes);
app.use('/posts', authenticateJWT, postRoutes);
app.use('/feed', authenticateJWT, feedRoutes);
app.use('/stories', authenticateJWT, storyRoutes);
app.use('/live', authenticateJWT, liveRoutes);
app.use('/messaging', authenticateJWT, messagingRoutes);
app.use('/channels', authenticateJWT, channelRoutes);
app.use('/wallet', authenticateJWT, walletRoutes);
app.use('/notifications', authenticateJWT, notificationRoutes);

// Admin routes (with admin check)
app.use('/admin', authenticateJWT, requireAdmin, adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Long-running HTTP server — skipped on Vercel, where `api/index.js` mounts
// this app under `/api` and Vercel manages the request lifecycle instead.
// Socket.io also only works with a long-running server, not serverless, so it
// is loaded lazily here to keep the serverless bundle minimal.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] DUYS backend running on port ${PORT}`);
  });

  // Attach Socket.io for real-time live features (viewers, chat).
  const { initSocket } = await import('./services/socket.js');
  initSocket(server);

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
