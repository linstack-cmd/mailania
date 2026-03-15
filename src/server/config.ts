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
  /** If set, used as-is. If omitted, inferred per-request from headers. */
  googleRedirectUri?: string;
  frontendOrigin?: string;
  port: number;
  inboxLimit: number;
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
      "GOOGLE_REDIRECT_URI",
      "FRONTEND_ORIGIN",
    ],
  );

  console.log(`[Config] Loaded ${secrets.size} secret(s) from Secret Party`);

  const googleClientId = secrets.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = secrets.get("GOOGLE_CLIENT_SECRET");
  const googleRedirectUri = secrets.get("GOOGLE_REDIRECT_URI"); // optional
  const frontendOrigin = secrets.get("FRONTEND_ORIGIN");

  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing required Secret Party keys: GOOGLE_CLIENT_ID, " +
        "GOOGLE_CLIENT_SECRET.",
    );
  }

  if (googleRedirectUri) {
    console.log("[Config] Using explicit GOOGLE_REDIRECT_URI from Secret Party");
  } else {
    console.log(
      "[Config] GOOGLE_REDIRECT_URI not set — will infer per-request from headers",
    );
  }

  _config = {
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    frontendOrigin,
    port: Number(process.env.PORT) || 3001,
    inboxLimit: Number(process.env.INBOX_LIMIT) || 25,
  };

  return _config;
}

/** Synchronous accessor — throws if loadConfig() hasn't been called. */
export function getConfig(): AppConfig {
  if (!_config)
    throw new Error("Config not loaded — call loadConfig() at startup first");
  return _config;
}
