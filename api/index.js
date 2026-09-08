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

/**
 * Ensure the database schema exists before the first request is served.
 * On serverless (Vercel) `app.js` intentionally skips its `if (!process.env.VERCEL)`
 * startup block, so `migrateOnBoot()` would never run there — which is exactly how
 * a connected-but-empty Neon/Supabase DB stays empty. This module-level call runs
 * once per cold-started function instance. `schema-merged.sql` is idempotent and a
 * `schema_migrations` row makes repeated runs a no-op, so concurrent cold starts
 * are safe (only the first applies).
 */
const { migrateOnBoot } = await import('../backend/src/config/migrate.js');
migrateOnBoot(); // fire-and-forget: first request may return 503 until applied

// Breadcrumb for runtime logs: if requests fail with FUNCTION_INVOCATION_FAILED
// and this line is absent from the logs, the crash happens during module init
// (i.e. an import in the backend dependency graph throws at cold start).
console.log('[duys] API function initialized');

export default app;
