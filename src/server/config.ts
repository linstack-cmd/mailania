/**
 * Centralized app config with Secret Party as the single source of truth.
 *
 * Required secrets are fetched from Secret Party at startup.
 * Call loadConfig() once at startup before accepting requests.
 */

import { fetchSecrets } from "./secret-party.js";

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  frontendOrigin?: string;
  port: number;
  inboxLimit: number;
  anthropicApiKey?: string;
  anthropicModel: string;
}

let _config: AppConfig | null = null;

/**
 * Load configuration strictly from Secret Party for OAuth-related values.
 * Throws if Secret Party is not configured or required keys are missing.
 */
export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;

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
    ],
  );

  console.log(`[Config] Loaded ${secrets.size} secret(s) from Secret Party`);

  const googleClientId = secrets.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = secrets.get("GOOGLE_CLIENT_SECRET");
  const frontendOrigin = secrets.get("FRONTEND_ORIGIN");
  const anthropicApiKey = secrets.get("ANTHROPIC_API_KEY");
  const anthropicModel = secrets.get("ANTHROPIC_MODEL");

  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing required Secret Party keys: GOOGLE_CLIENT_ID, " +
        "GOOGLE_CLIENT_SECRET.",
    );
  }

  if (anthropicApiKey) {
    console.log("[Config] Anthropic API key loaded — triage suggestions enabled");
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
  };

  return _config;
}

/** Synchronous accessor — throws if loadConfig() hasn't been called. */
export function getConfig(): AppConfig {
  if (!_config)
    throw new Error("Config not loaded — call loadConfig() at startup first");
  return _config;
}
