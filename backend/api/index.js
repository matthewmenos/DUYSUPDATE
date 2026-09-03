/**
 * Vercel serverless entry point.
 *
 * Vercel's project Root Directory is `backend/`, so this function lives at
 * `backend/api/index.js` and every `/api/*` request is routed here via the
 * rewrites in `vercel.json`. The full Express app from `src/app.js` is
 * mounted at `/api`, so a request to `/api/posts` reaches the `/posts` route.
 *
 * Dependencies are installed at the repo root (`npm install` at `/vercel/path0`
 * installs both backend and frontend deps via npm workspaces).
 */
import express from 'express';
import app from '../src/app.js';

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

export default server;