/**
 * Database connection module.
 *
 * Uses DATABASE_URL (CockroachDB/Postgres compatible) fetched from Secret Party.
 * Provides a shared Pool instance and startup table initialization.
 */

import pg from "pg";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

/**
 * Initialize the database pool and create required tables.
 * Must be called once at startup with the DATABASE_URL.
 */
export async function initDb(databaseUrl: string): Promise<pg.Pool> {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("cockroachlabs.cloud")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 5,
  });

  // Verify connectivity
  const client = await _pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("[DB] Connected successfully");
  } finally {
    client.release();
  }

  // Create session table used by connect-pg-simple (idempotent)
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" VARCHAR NOT NULL PRIMARY KEY,
      "sess" JSONB NOT NULL,
      "expire" TIMESTAMPTZ NOT NULL
    )
  `);

  // Index for session expiry cleanup
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);

  console.log("[DB] Session table ready");
  return _pool;
}

/** Get the initialized pool. Throws if initDb() hasn't been called. */
export function getPool(): pg.Pool {
  if (!_pool) throw new Error("Database not initialized — call initDb() first");
  return _pool;
}
