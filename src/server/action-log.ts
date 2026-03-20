/**
 * Action audit log — records all Phase 2 mutation attempts (v2: user-centric).
 */

import { getPool } from "./db.js";

export type ActionStatus = "approved" | "denied" | "success" | "failure";

export interface LogActionParams {
  userId: string;
  action: string;
  status: ActionStatus;
  targetSummary?: unknown;
  tokenId?: string;
  error?: string;
}

export async function logAction(params: LogActionParams): Promise<string> {
  const result = await getPool().query(
    `INSERT INTO "action_log" ("user_id", "action", "status", "target_summary", "token_id", "error")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING "id"`,
    [
      params.userId,
      params.action,
      params.status,
      params.targetSummary ? JSON.stringify(params.targetSummary) : null,
      params.tokenId ?? null,
      params.error ?? null,
    ],
  );
  return result.rows[0].id;
}
