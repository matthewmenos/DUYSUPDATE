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
import app from '../backend/api/index.js';

// Breadcrumb for runtime logs: if requests fail with FUNCTION_INVOCATION_FAILED
// and this line is absent from the logs, the crash happens during module init
// (i.e. an import in the backend dependency graph throws at cold start).
console.log('[duys] API function initialized');

export default app;
