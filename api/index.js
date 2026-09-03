/**
 * Vercel serverless entry point.
 *
 * Vercel routes every `/api/*` request to this function (see the rewrites in
 * vercel.json). The full Express app from `backend/src/app.js` is mounted at
 * `/api`, so a request to `/api/posts` reaches the `/posts` route.
 *
 * Backend dependencies are installed via `npm install` at the repo root
 * (npm workspaces installs both backend and frontend deps).
 */
import express from 'express';
import app from '../backend/src/app.js';

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

export default server;
