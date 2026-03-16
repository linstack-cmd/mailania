import { google } from "googleapis";
import type { Request } from "express";
import { getConfig } from "./config.js";

// Augment express-session to include our token data
declare module "express-session" {
  interface SessionData {
    tokens?: Record<string, unknown>;
  }
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

const CALLBACK_PATH = "/auth/callback";

/**
 * Resolve the OAuth redirect URI from request context.
 *
 * Protocol precedence (handles Cloudflare → origin HTTP scenario):
 *   1. `cf-visitor` JSON header — Cloudflare sets this with the *client-facing*
 *      scheme even when the origin connection is plain HTTP.
 *   2. `x-forwarded-proto` — standard reverse-proxy header (Traefik / nginx).
 *   3. `req.protocol` — Express-detected protocol (fallback).
 */
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

/**
 * Build an OAuth2 client with a placeholder redirect URI (for token loading).
 */
function getOAuth2Client() {
  const cfg = getConfig();
  return new google.auth.OAuth2(
    cfg.googleClientId,
    cfg.googleClientSecret,
    "http://localhost/auth/callback",
  );
}

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
 * Exchange OAuth code and store tokens in the session.
 */
export async function exchangeCode(code: string, req: Request) {
  const redirectUri = resolveRedirectUri(req);
  const client = makeOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Store tokens in session (persisted to DB via connect-pg-simple)
  req.session.tokens = tokens as Record<string, unknown>;

  // Save session explicitly to ensure it's written before redirect
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return client;
}

/**
 * Load OAuth2 client from session-stored tokens.
 * Returns null if no tokens in session.
 */
export function loadToken(req: Request) {
  const tokens = req.session?.tokens;
  if (!tokens) return null;
  try {
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    return client;
  } catch {
    return null;
  }
}

/**
 * Check if the current session is authenticated.
 */
export function isAuthenticated(req: Request): boolean {
  return !!req.session?.tokens;
}

/**
 * Clear tokens from session (logout).
 */
export function logout(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
