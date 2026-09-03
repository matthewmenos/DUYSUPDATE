/**
 * Vercel serverless entry point (API only) — repo-root copy.
 *
 * The full Express backend (`backend/src/app.js`) is mounted under `/api`,
 * so a request to `/api/posts` reaches the `/posts` route. A twin copy lives
 * at `frontend/api/index.js` for the case where Vercel's project Root
 * Directory is `frontend/`; this root copy is used when the Root Directory
 * is the repo root `/`. Only one is ever active, depending on Vercel's
 * Root Directory setting.
 *
 * The SPA is served statically (see `outputDirectory` in vercel.json) with
 * an `/index.html` fallback rewrite for client-side routes.
 */
import express from 'express';
import app from '../backend/src/app.js';

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

export default server;