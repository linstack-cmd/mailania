/**
 * Approval Token system — Phase 2 safety gate.
 *
 * Every Gmail mutation requires a valid, unexpired, unconsumed approval token
 * whose scope and payload hash match the requested action. Tokens are single-use
 * and expire after a short TTL (default 10 minutes).
 */

import crypto from "crypto";
import { getPool } from "./db.js";

/** How long an approval token stays valid (ms). */
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type ApprovalScope =
  | "archive_bulk"
  | "create_filter"
  | "label_messages"
  | "unarchive";

export interface ApprovalTokenRow {
  id: string;
  scope: ApprovalScope;
  payload_hash: string;
  session_id: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

/**
 * Deterministic hash of the action payload.
 * Used to ensure the token matches exactly what the user approved.
 */
export function hashPayload(payload: unknown): string {
  const canonical = JSON.stringify(payload, Object.keys(payload as any).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Create an approval token for a given scope + payload.
 */
export async function createApprovalToken(
  sessionId: string,
  scope: ApprovalScope,
  payload: unknown,
): Promise<ApprovalTokenRow> {
  const payloadHash = hashPayload(payload);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const result = await getPool().query(
    `INSERT INTO "approval_token" ("scope", "payload_hash", "session_id", "expires_at")
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [scope, payloadHash, sessionId, expiresAt],
  );

  return result.rows[0];
}

export interface TokenValidationError {
  valid: false;
  code: string;
  message: string;
}

export interface TokenValidationSuccess {
  valid: true;
  token: ApprovalTokenRow;
}

/**
 * Validate and consume an approval token. Single-use: once consumed, cannot be reused.
 *
 * Checks: exists, correct scope, matching payload hash, not expired, not already consumed.
 */
export async function validateAndConsumeToken(
  tokenId: string,
  scope: ApprovalScope,
  payload: unknown,
): Promise<TokenValidationSuccess | TokenValidationError> {
  const pool = getPool();
  const payloadHash = hashPayload(payload);

  const result = await pool.query(
    `SELECT * FROM "approval_token" WHERE "id" = $1`,
    [tokenId],
  );

  if (result.rows.length === 0) {
    return { valid: false, code: "TOKEN_NOT_FOUND", message: "Approval token not found" };
  }

  const token: ApprovalTokenRow = result.rows[0];

  if (token.scope !== scope) {
    return { valid: false, code: "SCOPE_MISMATCH", message: `Token scope "${token.scope}" does not match required "${scope}"` };
  }

  if (token.payload_hash !== payloadHash) {
    return { valid: false, code: "PAYLOAD_MISMATCH", message: "Token payload does not match the requested action" };
  }

  if (new Date(token.expires_at) < new Date()) {
    return { valid: false, code: "TOKEN_EXPIRED", message: "Approval token has expired" };
  }

  if (token.consumed_at) {
    return { valid: false, code: "TOKEN_CONSUMED", message: "Approval token has already been used" };
  }

  // Consume the token (atomic update with re-check)
  const update = await pool.query(
    `UPDATE "approval_token"
     SET "consumed_at" = now()
     WHERE "id" = $1 AND "consumed_at" IS NULL
     RETURNING *`,
    [tokenId],
  );

  if (update.rows.length === 0) {
    return { valid: false, code: "TOKEN_CONSUMED", message: "Approval token was consumed by a concurrent request" };
  }

  return { valid: true, token: update.rows[0] };
}
