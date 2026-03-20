/**
 * Centralized app config with Secret Party as the single source of truth.
 *
 * Required secrets are fetched from Secret Party at startup.
 * Call loadConfig() once at startup before accepting requests.
 *
 * LOCAL DEV MODE:
 *   Set LOCAL_DEV_NO_AUTH=true to skip Google OAuth and Secret Party entirely.
 *   See README for details.
 */

import { fetchSecrets } from "./secret-party.js";
import crypto from "crypto";

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  frontendOrigin?: string;
  port: number;
  inboxLimit: number;
  anthropicApiKey?: string;
  anthropicModel: string;
  databaseUrl: string;
  sessionSecret: string;
  /** When true, auth is bypassed and mock data is served. */
  localDevNoAuth: boolean;
  /** WebAuthn Relying Party ID (domain, e.g. "mailania.example.com"). Defaults to hostname from FRONTEND_ORIGIN or "localhost". */
  webauthnRpId?: string;
  /** WebAuthn expected origin (e.g. "https://mailania.example.com"). Defaults to FRONTEND_ORIGIN or http://localhost:PORT. */
  webauthnOrigin?: string;
}

let _config: AppConfig | null = null;

/**
 * Check if local dev no-auth mode is enabled.
 */
export function isLocalDevMode(): boolean {
  return process.env.LOCAL_DEV_NO_AUTH === "true";
}

/**
 * Load config for LOCAL_DEV_NO_AUTH mode.
 * Requires only DATABASE_URL and SESSION_SECRET (with sane defaults).
 */
function loadLocalDevConfig(): AppConfig {
  console.log(
    "[Config] ⚠️  LOCAL_DEV_NO_AUTH=true — running in local dev mode (no Google OAuth)",
  );

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "LOCAL_DEV_NO_AUTH requires DATABASE_URL. " +
        "Set it in .env (e.g. postgresql://user:pass@localhost:5432/mailania)",
    );
  }

  const sessionSecret =
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

  if (!process.env.SESSION_SECRET) {
    console.log(
      "[Config] SESSION_SECRET not set — using random ephemeral secret (sessions won't persist across restarts)",
    );
  }

  return {
    googleClientId: "local-dev-placeholder",
    googleClientSecret: "local-dev-placeholder",
    frontendOrigin: process.env.FRONTEND_ORIGIN,
    port: Number(process.env.PORT) || 3001,
    inboxLimit: Number(process.env.INBOX_LIMIT) || 25,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    databaseUrl,
    sessionSecret,
    localDevNoAuth: true,
    webauthnRpId: process.env.WEBAUTHN_RP_ID,
    webauthnOrigin: process.env.WEBAUTHN_ORIGIN,
  };
}

/**
 * Load configuration strictly from Secret Party for OAuth-related values.
 * Throws if Secret Party is not configured or required keys are missing.
 */
export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;

  // --- Local dev mode: skip Secret Party entirely ---
  if (isLocalDevMode()) {
    _config = loadLocalDevConfig();
    return _config;
  }

  const spApiUrl = process.env.SECRET_PARTY_API_URL;
  const spEnvId = process.env.SECRET_PARTY_ENVIRONMENT_ID;
  const spPrivateKey = process.env.SECRET_PARTY_PRIVATE_KEY_BASE64;

  if (!spApiUrl || !spEnvId || !spPrivateKey) {
    throw new Error(
      "Missing Secret Party config. Set SECRET_PARTY_API_URL, " +
        "SECRET_PARTY_ENVIRONMENT_ID, and SECRET_PARTY_PRIVATE_KEY_BASE64.",
    );
  }

  console.log("[Config] Fetching secrets from Secret Party…");

  const secrets = await fetchSecrets(
    {
      apiUrl: spApiUrl,
      environmentId: spEnvId,
      privateKeyBase64: spPrivateKey,
    },
    [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "FRONTEND_ORIGIN",
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_MODEL",
      "DATABASE_URL",
      "SESSION_SECRET",
    ],
  );

  console.log(`[Config] Loaded ${secrets.size} secret(s) from Secret Party`);

  const googleClientId = secrets.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = secrets.get("GOOGLE_CLIENT_SECRET");
  const frontendOrigin = secrets.get("FRONTEND_ORIGIN");
  const anthropicApiKey = secrets.get("ANTHROPIC_API_KEY");
  const anthropicModel = secrets.get("ANTHROPIC_MODEL");
  const databaseUrl = secrets.get("DATABASE_URL") || process.env.DATABASE_URL;
  const sessionSecret =
    secrets.get("SESSION_SECRET") || process.env.SESSION_SECRET;

  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing required Secret Party keys: GOOGLE_CLIENT_ID, " +
        "GOOGLE_CLIENT_SECRET.",
    );
  }

  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL — add it to Secret Party or set as env var.",
    );
  }

  if (!sessionSecret) {
    throw new Error(
      "Missing SESSION_SECRET — add it to Secret Party or set as env var. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  if (anthropicApiKey) {
    console.log(
      "[Config] Anthropic API key loaded — triage suggestions enabled",
    );
  } else {
    console.warn(
      "[Config] ANTHROPIC_API_KEY not found in Secret Party — " +
        "POST /api/triage/suggest will return 503",
    );
  }

  _config = {
    googleClientId,
    googleClientSecret,
    frontendOrigin,
    port: Number(process.env.PORT) || 3001,
    inboxLimit: Number(process.env.INBOX_LIMIT) || 25,
    anthropicApiKey,
    anthropicModel: anthropicModel || "claude-sonnet-4-20250514",
    databaseUrl,
    sessionSecret,
    localDevNoAuth: false,
    webauthnRpId: process.env.WEBAUTHN_RP_ID,
    webauthnOrigin: process.env.WEBAUTHN_ORIGIN,
  };

  return _config;
}

/** Synchronous accessor — throws if loadConfig() hasn't been called. */
export function getConfig(): AppConfig {
  if (!_config)
    throw new Error("Config not loaded — call loadConfig() at startup first");
  return _config;
}
