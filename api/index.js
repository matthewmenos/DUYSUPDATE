/**
 * Vercel Serverless Function entry (root `api/` directory — Vercel's standard
 * location for a single-project deployment).
 *
 * Re-exports the backend Express app so the API and the static frontend are
 * served from the SAME Vercel project/domain. `vercel.json` rewrites
 * `/api/*` to this function; the function itself mounts the app under both
 * `/api` and the root so either path-visibility behaviour resolves.
 *
 * `app.js` skips `app.listen()` under the VERCEL env (Vercel invokes the
 * handler directly instead of running an HTTP server).
 */
export { default } from '../backend/api/index.js';
