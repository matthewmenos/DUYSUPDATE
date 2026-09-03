/**
 * Vercel serverless entry point (single function serves both API + SPA).
 *
 * Vercel's Root Directory is `backend/`, so this function lives at
 * `backend/api/index.js`. The built SPA (Vite output `backend/dist`) is
 * bundled into the function via the `includeFiles: "dist/**"` setting in
 * `vercel.json`, and a catch-all rewrite sends every request here:
 *
 *   - `/api/*` → the full Express backend (`src/app.js`)
 *   - `/*`     → the static SPA from `dist/`, with an `index.html` fallback
 *                so client-side routes (e.g. /messages, /profile/x) work.
 *
 * This avoids Vercel scanning `dist` as a serverless-function output (the
 * "No entrypoint found in output directory" error), because no
 * `outputDirectory` is declared in `vercel.json`.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import app from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

const server = express();
server.disable('x-powered-by');

// The backend app owns its own 404 + error handlers.
server.use('/api', app);

// Serve the bundled SPA (only present when the Vite build ran).
if (fs.existsSync(distDir)) {
  server.use(express.static(distDir));
}

// SPA fallback: client-side routes (not under /api) return index.html.
server.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexFile = path.join(distDir, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  return next();
});

export default server;