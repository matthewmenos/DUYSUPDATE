import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ── Startup diagnostic ─────────────────────────────────────────────────────
// Vercel serverless functions have NO local PostgreSQL, so a DATABASE_URL that
// is missing or still points at localhost/127.0.0.1 will fail at request time
// with ECONNREFUSED. Fail fast with a clear message instead. This is SSE-only;
// it must never expose the connection string in an external-facing response.
const dbUrl = process.env.DATABASE_URL || '';
const isLocalPlaceholder =
  /localhost|127\.0\.0\.1/.test(dbUrl) || dbUrl.includes('user:password@');
if (!dbUrl) {
  console.error(
    '[database] DATABASE_URL is not set. Set it in Vercel → Settings → ' +
    'Environment Variables (hosted Postgres, e.g. Neon/Supabase/Railway/RDS).'
  );
} else if (process.env.NODE_ENV === 'production' && isLocalPlaceholder) {
  console.error(
    '[database] DATABASE_URL still points at a LOCAL database ' +
    `(${dbUrl.replace(/\/\/.*?@/, '//***@')}). Vercel has no local Postgres — ` +
    'set DATABASE_URL to your hosted PostgreSQL connection string.'
  );
}

export const pool = new Pool({
  connectionString: dbUrl || undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Execute a query
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error', { text, error });
    throw error;
  }
}

/**
 * Get a single row
 */
export async function queryOne(text, params) {
  const result = await query(text, params);
  return result.rows[0];
}

/**
 * Get all rows
 */
export async function queryAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Start a transaction
 */
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
