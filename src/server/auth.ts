/**
 * Auth module — v2 (user-centric model with passkey + Gmail OAuth).
 *
 * Session now stores `userId` (Mailania user) and `activeGmailAccountId`.
 * Google OAuth tokens are stored in `gmail_account` table, not on the session.
 * Passkey (WebAuthn) provides passwordless Mailania login.
 */

import { google } from "googleapis";
import type { Request, Response } from "express";
import { getConfig } from "./config.js";
import { getPool } from "./db.js";
import type { OAuth2Client } from "google-auth-library";

// Augment express-session to include our user data
declare module "express-session" {
  interface SessionData {
    /** Mailania user ID (UUID) */
    userId?: string;
    /** Active Gmail account ID for API operations */
    activeGmailAccountId?: string;
    /** Passkey registration challenge (ephemeral) */
    passkeyChallenge?: string;
    /** Legacy: tokens stored directly (removed in v2) */
    tokens?: Record<string, unknown>;
  }
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const CALLBACK_PATH = "/auth/callback";

// -----------------------------------------------------------------------
// Protocol / redirect URI resolution (unchanged)
// -----------------------------------------------------------------------

export function resolveRedirectUri(req: Request): string {
  let proto: string | undefined;

  const cfVisitor = req.get("cf-visitor");
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor);
      if (parsed && typeof parsed.scheme === "string" && parsed.scheme) {
        proto = parsed.scheme;
      }
    } catch {
      // Malformed cf-visitor — fall through
    }
  }

  if (!proto) {
    const xfp = req.get("x-forwarded-proto");
    if (xfp) {
      proto = xfp.split(",")[0].trim();
    }
  }

  if (!proto) {
    proto = req.protocol;
  }

  const rawHost = req.get("x-forwarded-host") || req.get("host");
  if (!rawHost) {
    throw new Error("Cannot infer redirect URI: no Host header");
  }
  const host = rawHost.split(",")[0].trim();

  return `${proto}://${host}${CALLBACK_PATH}`;
}

function makeOAuth2Client(redirectUri: string) {
  const cfg = getConfig();
  return new google.auth.OAuth2(
    cfg.googleClientId,
    cfg.googleClientSecret,
    redirectUri,
  );
}

// -----------------------------------------------------------------------
// Gmail OAuth flow
// -----------------------------------------------------------------------

/**
 * Build the Google OAuth consent URL.
 * If the user is already logged in (has userId), we're adding a Gmail account.
 * If not logged in, we'll create/find user from Google profile after callback.
 */
export function getAuthUrl(req: Request): string {
  const redirectUri = resolveRedirectUri(req);
  const client = makeOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

/**
 * Exchange OAuth code, fetch Google profile, and:
 * - If user is already logged in → link Gmail account to existing user
 * - If not logged in → find/create user by email, then link Gmail account
 */
export async function exchangeCode(code: string, req: Request) {
  const redirectUri = resolveRedirectUri(req);
  const client = makeOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Fetch Google profile to get email
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profileRes = await oauth2.userinfo.get();
  const googleEmail = profileRes.data.email;
  const googleName = profileRes.data.name || profileRes.data.email || "User";

  if (!googleEmail) {
    throw new Error("Could not retrieve email from Google profile");
  }

  const pool = getPool();
  let userId = req.session.userId;

  if (!userId) {
    // Not logged in — find or create user by email
    const existing = await pool.query(
      `SELECT "id" FROM "mailania_user" WHERE "email" = $1`,
      [googleEmail],
    );

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
    } else {
      const created = await pool.query(
        `INSERT INTO "mailania_user" ("display_name", "email")
         VALUES ($1, $2)
         RETURNING "id"`,
        [googleName, googleEmail],
      );
      userId = created.rows[0].id;
    }
  }

  // Upsert Gmail account
  const upsertResult = await pool.query(
    `INSERT INTO "gmail_account" ("user_id", "email", "tokens", "is_primary")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("user_id", "email")
     DO UPDATE SET "tokens" = $3, "updated_at" = now()
     RETURNING "id"`,
    [userId, googleEmail, JSON.stringify(tokens), true],
  );

  const gmailAccountId = upsertResult.rows[0].id;

  // Set session
  req.session.userId = userId;
  req.session.activeGmailAccountId = gmailAccountId;

  // Save session explicitly
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return client;
}

// -----------------------------------------------------------------------
// Session / auth state helpers
// -----------------------------------------------------------------------

/**
 * Check if the current session is authenticated (has a Mailania user).
 */
export function isAuthenticated(req: Request): boolean {
  return !!req.session?.userId;
}

/**
 * Get the current user's ID. Returns null if not logged in.
 */
export function getUserId(req: Request): string | null {
  return req.session?.userId ?? null;
}

/**
 * Load OAuth2 client for the active Gmail account.
 * Returns null if no active Gmail account or no tokens.
 */
export async function loadGmailClient(req: Request): Promise<OAuth2Client | null> {
  const gmailAccountId = req.session?.activeGmailAccountId;
  if (!gmailAccountId) return null;

  const pool = getPool();
  const result = await pool.query(
    `SELECT "tokens" FROM "gmail_account" WHERE "id" = $1`,
    [gmailAccountId],
  );

  if (result.rows.length === 0) return null;

  const tokens = result.rows[0].tokens;
  if (!tokens) return null;

  try {
    const cfg = getConfig();
    const client = new google.auth.OAuth2(
      cfg.googleClientId,
      cfg.googleClientSecret,
      "http://localhost/auth/callback",
    );
    client.setCredentials(tokens);

    // Set up token refresh callback to persist updated tokens
    client.on("tokens", async (newTokens) => {
      try {
        const merged = { ...tokens, ...newTokens };
        await pool.query(
          `UPDATE "gmail_account" SET "tokens" = $1, "updated_at" = now() WHERE "id" = $2`,
          [JSON.stringify(merged), gmailAccountId],
        );
      } catch (err) {
        console.error("[Auth] Failed to persist refreshed tokens:", err);
      }
    });

    return client;
  } catch {
    return null;
  }
}

/**
 * Legacy compat: loadToken that works with the new model.
 * Used by existing code that expects synchronous token loading.
 * Returns null — callers should migrate to loadGmailClient().
 */
export function loadToken(req: Request): null {
  // Deprecated: use loadGmailClient() instead
  return null;
}

/**
 * Get all Gmail accounts for a user.
 */
export async function getUserGmailAccounts(userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "id", "email", "is_primary", "created_at", "updated_at"
     FROM "gmail_account"
     WHERE "user_id" = $1
     ORDER BY "is_primary" DESC, "created_at" ASC`,
    [userId],
  );
  return result.rows;
}

/**
 * Switch the active Gmail account for the session.
 */
export async function switchGmailAccount(req: Request, gmailAccountId: string): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) return false;

  const pool = getPool();
  const result = await pool.query(
    `SELECT "id" FROM "gmail_account" WHERE "id" = $1 AND "user_id" = $2`,
    [gmailAccountId, userId],
  );

  if (result.rows.length === 0) return false;

  req.session.activeGmailAccountId = gmailAccountId;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return true;
}

/**
 * Remove a linked Gmail account.
 */
export async function unlinkGmailAccount(userId: string, gmailAccountId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM "gmail_account" WHERE "id" = $1 AND "user_id" = $2 RETURNING "id"`,
    [gmailAccountId, userId],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Clear session (logout).
 */
export function logout(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Get the Mailania user record.
 */
export async function getUser(userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "id", "display_name", "email", "created_at" FROM "mailania_user" WHERE "id" = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}
