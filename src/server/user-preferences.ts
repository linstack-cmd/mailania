import { getPool } from "./db.js";

const MAX_TRIAGE_PREFERENCES_LENGTH = 4000;

export function normalizeTriagePreferences(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length > MAX_TRIAGE_PREFERENCES_LENGTH) {
    throw new Error(`Triage Preferences must be ${MAX_TRIAGE_PREFERENCES_LENGTH} characters or fewer`);
  }
  return normalized;
}

export async function getUserTriagePreferences(userId: string): Promise<string> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "triage_preferences" FROM "mailania_user" WHERE "id" = $1`,
    [userId],
  );
  return (result.rows[0]?.triage_preferences as string | undefined) ?? "";
}

export async function updateUserTriagePreferences(userId: string, value: string): Promise<string> {
  const pool = getPool();
  const normalized = normalizeTriagePreferences(value);
  const result = await pool.query(
    `UPDATE "mailania_user"
     SET "triage_preferences" = $1,
         "updated_at" = now()
     WHERE "id" = $2
     RETURNING "triage_preferences"`,
    [normalized, userId],
  );

  if (result.rowCount === 0) {
    throw new Error("User not found");
  }

  return result.rows[0].triage_preferences as string;
}

export { MAX_TRIAGE_PREFERENCES_LENGTH };
