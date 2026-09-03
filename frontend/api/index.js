/**
 * Vercel serverless entry point (API only) — frontend-root copy.
 *
 * Used when Vercel's project Root Directory is `frontend/` (which is what
 * the "No Output Directory named dist found" failures indicate). The full
 * Express backend at the repo root (`../../backend/src/app.js`) is mounted
 * under `/api`; Vercel's function bundler traces this relative import and
 * packages the whole app with its dependencies into this one function.
 *
 * The repo-root twin at `api/index.js` is used when the Root Directory is `/`.
 * Only one copy is ever active depending on Vercel's Root Directory setting.
 */
import express from 'express';
import app from '../../backend/src/app.js';

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

export default server;