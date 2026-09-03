/**
 * Vercel Serverless Function entry for the `backend` service.
 *
 * Vercel auto-discovers `api/*.js` under the service root (`backend/`) and
 * compiles each into a Serverless Function. This mounts the full Express app
 * from `src/app.js` (with `/health`, `/auth`, `/users`, `/posts`, ...) so the
 * API is reachable.
 *
 * Vercel may forward either the full `/api/...` path OR the stripped `/...`
 * path to the function depending on its routing version, so the app is mounted
 * under both the `/api` prefix and the root — either way the backend routes
 * resolve. `app.js` skips `app.listen()` under the VERCEL env (Vercel invokes
 * the handler directly instead of running an HTTP server).
 */
import express from 'express';
import app from '../src/app.js';

const server = express();
server.disable('x-powered-by');

// Handle both possible path-visibility behaviours Vercel may use.
server.use('/api', app);
server.use(app);

export default server;
