/**
 * Database connection module — v2 (user-centric model).
 *
 * Uses DATABASE_URL (CockroachDB/Postgres compatible) fetched from Secret Party.
 * Provides a shared Pool instance and startup table initialization.
 *
 * BREAKING CHANGE: This replaces the session_id-centric model with proper
 * user accounts. Run with RESET_DB=true or drop tables manually on first deploy.
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

  // Optional: reset all tables for clean migration
  if (process.env.RESET_DB === "true") {
    console.log("[DB] ⚠️  RESET_DB=true — dropping all application tables…");
    await _pool.query(`
      DROP TABLE IF EXISTS "chat_tool_trace" CASCADE;
      DROP TABLE IF EXISTS "suggestion_revision" CASCADE;
      DROP TABLE IF EXISTS "suggestion_message" CASCADE;
      DROP TABLE IF EXISTS "suggestion_conversation" CASCADE;
      DROP TABLE IF EXISTS "suggestion_feedback" CASCADE;
      DROP TABLE IF EXISTS "action_log" CASCADE;
      DROP TABLE IF EXISTS "approval_token" CASCADE;
      DROP TABLE IF EXISTS "triage_run" CASCADE;
      DROP TABLE IF EXISTS "gmail_account" CASCADE;
      DROP TABLE IF EXISTS "passkey_credential" CASCADE;
      DROP TABLE IF EXISTS "mailania_user" CASCADE;
      DROP TABLE IF EXISTS "session" CASCADE;
    `);
    console.log("[DB] All tables dropped. Recreating…");
  }

  // =====================================================================
  // Session table (connect-pg-simple)
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" VARCHAR NOT NULL PRIMARY KEY,
      "sess" JSONB NOT NULL,
      "expire" TIMESTAMPTZ NOT NULL
    )
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);
  console.log("[DB] Session table ready");

  // =====================================================================
  // Core: mailania_user — first-class user accounts
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "mailania_user" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "display_name" VARCHAR(255) NOT NULL,
      "email" VARCHAR(320),
      "triage_preferences" TEXT NOT NULL DEFAULT '',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await _pool.query(`
    ALTER TABLE "mailania_user"
    ADD COLUMN IF NOT EXISTS "triage_preferences" TEXT NOT NULL DEFAULT ''
  `);
  await _pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mailania_user_email"
    ON "mailania_user" ("email") WHERE "email" IS NOT NULL
  `);
  console.log("[DB] User table ready");

  // =====================================================================
  // Passkey credentials (WebAuthn)
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "passkey_credential" (
      "id" VARCHAR(512) PRIMARY KEY,
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "public_key" BYTEA NOT NULL,
      "counter" BIGINT NOT NULL DEFAULT 0,
      "device_type" VARCHAR(32) NOT NULL DEFAULT 'singleDevice',
      "backed_up" BOOLEAN NOT NULL DEFAULT false,
      "transports" JSONB,
      "name" VARCHAR(255),
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Migration: add name column if table already exists without it
  await _pool.query(`
    ALTER TABLE "passkey_credential" ADD COLUMN IF NOT EXISTS "name" VARCHAR(255)
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_passkey_credential_user"
    ON "passkey_credential" ("user_id")
  `);
  console.log("[DB] Passkey credential table ready");

  // =====================================================================
  // Gmail accounts — multiple per user
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "gmail_account" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "email" VARCHAR(320) NOT NULL,
      "tokens" JSONB NOT NULL,
      "is_primary" BOOLEAN NOT NULL DEFAULT false,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await _pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gmail_account_user_email"
    ON "gmail_account" ("user_id", "email")
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_gmail_account_user"
    ON "gmail_account" ("user_id")
  `);
  console.log("[DB] Gmail account table ready");

  // =====================================================================
  // Triage runs — now keyed by user_id
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "triage_run" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "gmail_account_id" UUID REFERENCES "gmail_account"("id") ON DELETE SET NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "suggestions" JSONB NOT NULL,
      "source_messages" JSONB
    )
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_triage_run_user"
    ON "triage_run" ("user_id", "created_at" DESC)
  `);
  console.log("[DB] Triage run table ready");

  // =====================================================================
  // Approval tokens — now keyed by user_id
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "approval_token" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "scope" VARCHAR(64) NOT NULL,
      "payload_hash" VARCHAR(128) NOT NULL,
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "expires_at" TIMESTAMPTZ NOT NULL,
      "consumed_at" TIMESTAMPTZ,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_approval_token_user"
    ON "approval_token" ("user_id", "created_at" DESC)
  `);
  console.log("[DB] Approval token table ready");

  // =====================================================================
  // Action audit log — now keyed by user_id
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "action_log" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "action" VARCHAR(64) NOT NULL,
      "status" VARCHAR(16) NOT NULL,
      "target_summary" JSONB,
      "token_id" UUID,
      "error" TEXT,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_action_log_user"
    ON "action_log" ("user_id", "created_at" DESC)
  `);
  console.log("[DB] Action log table ready");

  // =====================================================================
  // Suggestion feedback — now keyed by user_id
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "suggestion_feedback" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "run_id" UUID,
      "suggestion_index" INT NOT NULL,
      "vote" VARCHAR(8) NOT NULL,
      "note" TEXT,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log("[DB] Suggestion feedback table ready");

  // =====================================================================
  // Conversation substrate — scoped general inbox chat + suggestion chat
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "suggestion_conversation" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "scope" VARCHAR(16) NOT NULL DEFAULT 'suggestion',
      "run_id" UUID,
      "suggestion_index" INT,
      "user_id" UUID NOT NULL REFERENCES "mailania_user"("id") ON DELETE CASCADE,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await _pool.query(`
    ALTER TABLE "suggestion_conversation"
    ADD COLUMN IF NOT EXISTS "scope" VARCHAR(16) NOT NULL DEFAULT 'suggestion'
  `);
  await _pool.query(`
    ALTER TABLE "suggestion_conversation"
    ALTER COLUMN "run_id" DROP NOT NULL
  `);
  await _pool.query(`
    ALTER TABLE "suggestion_conversation"
    ALTER COLUMN "suggestion_index" DROP NOT NULL
  `);
  await _pool.query(`
    DROP INDEX IF EXISTS "IDX_suggestion_conversation_unique"
  `);
  await _pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_suggestion_conversation_suggestion_unique"
    ON "suggestion_conversation" ("run_id", "suggestion_index", "user_id")
    WHERE "scope" = 'suggestion'
  `);
  await _pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_suggestion_conversation_general_unique"
    ON "suggestion_conversation" ("user_id", "scope")
    WHERE "scope" = 'general'
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_suggestion_conversation_user_scope"
    ON "suggestion_conversation" ("user_id", "scope", "updated_at" DESC)
  `);
  console.log("[DB] Suggestion conversation table ready");

  // =====================================================================
  // Suggestion messages (unchanged schema, FK to conversation)
  // =====================================================================
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

  // =====================================================================
  // Suggestion revisions (unchanged schema, FK to conversation)
  // =====================================================================
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

  // =====================================================================
  // Chat tool traces (unchanged schema, FK to conversation)
  // =====================================================================
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS "chat_tool_trace" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" UUID NOT NULL REFERENCES "suggestion_conversation"("id") ON DELETE CASCADE,
      "tool_name" VARCHAR(64) NOT NULL,
      "args" JSONB NOT NULL,
      "result_summary" TEXT NOT NULL,
      "duration_ms" INT NOT NULL DEFAULT 0,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await _pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_chat_tool_trace_conversation"
    ON "chat_tool_trace" ("conversation_id", "created_at" ASC)
  `);
  console.log("[DB] Chat tool trace table ready");

  return _pool;
}

/** Get the initialized pool. Throws if initDb() hasn't been called. */
export function getPool(): pg.Pool {
  if (!_pool) throw new Error("Database not initialized — call initDb() first");
  return _pool;
}
