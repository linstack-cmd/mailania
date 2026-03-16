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

  // Create triage_run table for persisting AI triage suggestion runs
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "triage_run" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "session_id" VARCHAR NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "suggestions" JSONB NOT NULL,
      "source_messages" JSONB
    )
  `);

  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_triage_run_session"
    ON "triage_run" ("session_id", "created_at" DESC)
  `);

  console.log("[DB] Triage run table ready");

  // --- Approval tokens (Phase 2 safety gate) ---
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "approval_token" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "scope" VARCHAR(64) NOT NULL,
      "payload_hash" VARCHAR(128) NOT NULL,
      "session_id" VARCHAR NOT NULL,
      "expires_at" TIMESTAMPTZ NOT NULL,
      "consumed_at" TIMESTAMPTZ,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_approval_token_session"
    ON "approval_token" ("session_id", "created_at" DESC)
  `);

  console.log("[DB] Approval token table ready");

  // --- Action audit log (Phase 2 auditability) ---
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "action_log" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "session_id" VARCHAR NOT NULL,
      "action" VARCHAR(64) NOT NULL,
      "status" VARCHAR(16) NOT NULL,
      "target_summary" JSONB,
      "token_id" UUID,
      "error" TEXT,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_action_log_session"
    ON "action_log" ("session_id", "created_at" DESC)
  `);

  console.log("[DB] Action log table ready");

  // --- Suggestion feedback ---
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "suggestion_feedback" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "session_id" VARCHAR NOT NULL,
      "run_id" UUID,
      "suggestion_index" INT NOT NULL,
      "vote" VARCHAR(8) NOT NULL,
      "note" TEXT,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  console.log("[DB] Suggestion feedback table ready");

  // --- Suggestion conversation (chat threads per suggestion) ---
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "suggestion_conversation" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" UUID NOT NULL,
      "suggestion_index" INT NOT NULL,
      "session_id" VARCHAR NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await _pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_suggestion_conversation_unique"
    ON "suggestion_conversation" ("run_id", "suggestion_index", "session_id")
  `);

  console.log("[DB] Suggestion conversation table ready");

  // --- Suggestion messages (chat messages within a conversation) ---
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "suggestion_message" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" UUID NOT NULL REFERENCES "suggestion_conversation"("id") ON DELETE CASCADE,
      "role" VARCHAR(16) NOT NULL,
      "content" TEXT NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_suggestion_message_conversation"
    ON "suggestion_message" ("conversation_id", "created_at" ASC)
  `);

  console.log("[DB] Suggestion message table ready");

  // --- Suggestion revisions (revised suggestion JSON from chat) ---
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "suggestion_revision" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" UUID NOT NULL REFERENCES "suggestion_conversation"("id") ON DELETE CASCADE,
      "revision_index" INT NOT NULL,
      "suggestion_json" JSONB NOT NULL,
      "source" VARCHAR(16) NOT NULL DEFAULT 'llm',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_suggestion_revision_conversation"
    ON "suggestion_revision" ("conversation_id", "revision_index" DESC)
  `);

  console.log("[DB] Suggestion revision table ready");

  return _pool;
}

/** Get the initialized pool. Throws if initDb() hasn't been called. */
export function getPool(): pg.Pool {
  if (!_pool) throw new Error("Database not initialized — call initDb() first");
  return _pool;
}
