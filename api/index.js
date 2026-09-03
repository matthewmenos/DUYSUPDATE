/**
 * Vercel serverless entry point (API only).
 *
 * Vercel's project Root Directory is the repository root (`/`), so this
 * function lives at `api/index.js` and receives every request whose visible
 * path starts with `/api` (see the rewrites in `vercel.json`). The full
 * Express backend (`backend/src/app.js`) is mounted at `/api`, so a request
 * to `/api/posts` reaches the `/posts` route.
 *
 * Backend workspace dependencies (express, pg, joi, ...) are hoisted into
 * the root `node_modules` by `npm install` (npm workspaces), so they resolve.
 *
 * The SPA is served statically from `frontend/dist` (the `outputDirectory`
 * in `vercel.json`) with an `/index.html` fallback rewrite for client routes.
 */
import express from 'express';
import app from '../backend/src/app.js';

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

export default server;