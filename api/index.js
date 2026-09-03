import express from 'express';
import app from '../backend/src/app.js';

/**
 * Vercel serverless entry point.
 *
 * Vercel routes every `/api/*` request to this function (see the rewrites in
 * vercel.json). The full Express app from `backend/src/app.js` is mounted at
 * `/api`, so a request to `/api/posts` reaches the `/posts` route.
 *
 * This project uses npm workspaces, so all backend dependencies are installed
 * at the repository root and are bundled with the function automatically.
 */

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

export default server;