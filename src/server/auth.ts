import { google } from "googleapis";
import fs from "fs";
import path from "path";
import type { Request } from "express";
import { getConfig } from "./config.js";

const TOKEN_PATH = path.resolve("token.json");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const CALLBACK_PATH = "/auth/callback";

/**
 * Resolve the OAuth redirect URI.
 *
 * Priority:
 *   1. Explicit value from Secret Party (config.googleRedirectUri)
 *   2. Inferred per-request from x-forwarded-proto/x-forwarded-host
 *      (standard behind Traefik / Dokploy reverse proxies)
 *   3. Fallback to req.protocol + req.get("host")
 *
 * Never infers from query params or other untrusted user input.
 */
export function resolveRedirectUri(req: Request): string {
  const cfg = getConfig();

  if (cfg.googleRedirectUri) {
    return cfg.googleRedirectUri;
  }

  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");

  if (!host) {
    throw new Error(
      "Cannot infer redirect URI: no Host header and GOOGLE_REDIRECT_URI not configured",
    );
  }

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
 * Build an OAuth2 client using a static redirect URI (for token loading only).
 * When no explicit URI is configured, a placeholder is fine because
 * setCredentials doesn't hit the redirect endpoint.
 */
export function getOAuth2Client() {
  const cfg = getConfig();
  return new google.auth.OAuth2(
    cfg.googleClientId,
    cfg.googleClientSecret,
    cfg.googleRedirectUri ?? "http://localhost/auth/callback",
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

export async function exchangeCode(code: string, req: Request) {
  const redirectUri = resolveRedirectUri(req);
  const client = makeOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return client;
}

export function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    return client;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return fs.existsSync(TOKEN_PATH);
}

export function logout(): void {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
}
