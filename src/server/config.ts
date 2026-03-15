/**
 * Centralized app config with Secret Party integration.
 *
 * Priority: Secret Party → environment variable → error (for required keys).
 * Call loadConfig() once at startup before accepting requests.
 */

import { fetchSecrets } from "./secret-party.js";

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  frontendOrigin?: string;
  port: number;
  inboxLimit: number;
}

let _config: AppConfig | null = null;

/**
 * Load configuration from Secret Party (if configured) with env var fallback.
 * Throws if required values are missing from both sources.
 */
export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;

  let secrets = new Map<string, string>();

  const spApiUrl = process.env.SECRET_PARTY_API_URL;
  const spEnvId = process.env.SECRET_PARTY_ENVIRONMENT_ID;
  const spPrivateKey = process.env.SECRET_PARTY_PRIVATE_KEY_BASE64;

  if (spApiUrl && spEnvId && spPrivateKey) {
    console.log("[Config] Secret Party configured — fetching secrets…");
    try {
      secrets = await fetchSecrets(
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
      console.log(
        `[Config] Loaded ${secrets.size} secret(s) from Secret Party`,
      );
    } catch (err) {
      console.error(
        "[Config] Secret Party fetch failed, falling back to env vars:",
        (err as Error).message,
      );
    }
  } else {
    console.log(
      "[Config] Secret Party not configured — using environment variables only",
    );
  }

  // Secret Party values take priority; env vars are the fallback
  const googleClientId =
    secrets.get("GOOGLE_CLIENT_ID") ?? process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret =
    secrets.get("GOOGLE_CLIENT_SECRET") ?? process.env.GOOGLE_CLIENT_SECRET;
  const googleRedirectUri =
    secrets.get("GOOGLE_REDIRECT_URI") ?? process.env.GOOGLE_REDIRECT_URI;
  const frontendOrigin =
    secrets.get("FRONTEND_ORIGIN") ?? process.env.FRONTEND_ORIGIN;

  if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
    throw new Error(
      "Missing required config: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and " +
        "GOOGLE_REDIRECT_URI must be provided via Secret Party or environment variables.",
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
