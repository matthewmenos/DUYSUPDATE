/**
 * migrate.js — automatic database migration runner.
 *
 * Runs the merged, idempotent schema (`schema-merged.sql`) against the
 * configured `DATABASE_URL` so the database ALWAYS converges to the latest
 * schema — on a fresh deploy AND on every boot of an existing database.
 *
 * Because `schema-merged.sql` is fully idempotent (IF NOT EXISTS everywhere,
 * guarded triggers, ON CONFLICT DO NOTHING seeds), executing it repeatedly is
 * safe. A `schema_migrations` table records when the merged schema was last
 * applied so we can skip redundant work and log the state.
 *
 * Usage:
 *   node src/config/migrate.js       # run migrations, then exit
 *   npm run migrate                  # (see backend/package.json)
 *
 * It is also called automatically at server startup (see: migrateOnBoot in
 * app.js). On serverless (Vercel) it is NOT auto-run on cold start — run the
 * CLI once (e.g. in a build hook / GitHub Action) instead.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MERGED_SCHEMA_PATH = path.join(__dirname, 'schema-merged.sql');

/**
 * Execute the merged schema idempotently.
 * @param {object} [options]
 * @param {string} [options.connectionString] optional override for DATABASE_URL
 * @returns {Promise<{ applied: boolean, tables: number, connectionString?: string }>}
 */
export async function runMigrations({ connectionString } = {}) {
  const conn = connectionString || process.env.DATABASE_URL;
  if (!conn) {
    throw new Error('DATABASE_URL is not set — cannot run migrations.');
  }

  const client = new pg.Client({ connectionString: conn });
  try {
    await client.connect();

    // Tracking table (idempotent).
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Skip work if this schema version was already applied.
    const existing = await client.query(
      `SELECT applied_at FROM schema_migrations WHERE name = $1`,
      ['schema-merged']
    );

    if (existing.rowCount > 0) {
      console.log(`[migrate] schema already up to date (${existing.rows[0].applied_at.toISOString?.() ?? existing.rows[0].applied_at})`);
      return { applied: false, tables: null };
    }

    // Apply the merged schema inside a transaction.
    const sql = readFileSync(MERGED_SCHEMA_PATH, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (name) VALUES ($1)`,
        ['schema-merged']
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Count tables for a friendly log line.
    const tables = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    console.log(`[migrate] schema applied successfully (${tables.rows[0].n} tables).`);
    return { applied: true, tables: tables.rows[0].n };
  } finally {
    await client.end();
  }
}

/**
 * Convenience wrapper for startup: run migrations if not explicitly disabled.
 * Set AUTO_MIGRATE=false in the environment to skip.
 * @returns {Promise<boolean>} true if migrations ran (or were already current)
 */
export async function migrateOnBoot() {
  if (process.env.AUTO_MIGRATE === 'false' || process.env.AUTO_MIGRATE === '0') {
    console.log('[migrate] skipped (AUTO_MIGRATE is disabled).');
    return false;
  }
  try {
    const result = await runMigrations();
    return result.applied;
  } catch (err) {
    console.error(`[migrate] migration failed: ${err.message}`);
    // Do not crash the server on a migration failure — surface it but continue.
    return false;
  }
}

// CLI entry — detect direct execution regardless of path casing on Windows.
const thisPath = fileURLToPath(import.meta.url);
const invoked = path.resolve(process.argv[1] || '');

if (path.resolve(thisPath) === invoked || process.env.RUN_MIGRATIONS === '1') {
  runMigrations()
    .then((r) => {
      console.log(r.applied ? 'Migration complete.' : 'Nothing to do.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}