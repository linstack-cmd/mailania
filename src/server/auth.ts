import { google } from "googleapis";
import fs from "fs";
import path from "path";
import type { Request } from "express";
import { getConfig } from "./config.js";

const TOKEN_PATH = path.resolve("token.json");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const CALLBACK_PATH = "/auth/callback";

/**
 * Resolve the OAuth redirect URI from request context.
 *
 * Protocol precedence (handles Cloudflare → origin HTTP scenario):
 *   1. `cf-visitor` JSON header — Cloudflare sets this with the *client-facing*
 *      scheme even when the origin connection is plain HTTP (e.g. Dokploy behind
 *      Cloudflare proxy with "Flexible" or "Full" SSL mode).
 *   2. `x-forwarded-proto` — standard reverse-proxy header (Traefik / nginx).
 *   3. `req.protocol` — Express-detected protocol (fallback).
 *
 * Host is inferred from `x-forwarded-host` or `host`. Comma-separated lists
 * (multiple proxies) are handled by taking the first (leftmost) value.
 *
 * Never infers from query params or other untrusted user input.
 */
export function resolveRedirectUri(req: Request): string {
  // --- Protocol inference ---
  let proto: string | undefined;

  // 1. Cloudflare cf-visitor header (JSON: {"scheme":"https"})
  //    Robust parse — invalid JSON must not throw.
  const cfVisitor = req.get("cf-visitor");
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor);
      if (parsed && typeof parsed.scheme === "string" && parsed.scheme) {
        proto = parsed.scheme;
      }
    } catch {
      // Malformed cf-visitor — fall through to next source
    }
  }

  // 2. x-forwarded-proto (take first value if comma-separated)
  if (!proto) {
    const xfp = req.get("x-forwarded-proto");
    if (xfp) {
      proto = xfp.split(",")[0].trim();
    }
  }

  // 3. Express req.protocol (derives from connection / trust proxy)
  if (!proto) {
    proto = req.protocol;
  }

  // --- Host inference ---
  const rawHost = req.get("x-forwarded-host") || req.get("host");

  if (!rawHost) {
    throw new Error("Cannot infer redirect URI: no Host header");
  }

  // Take first value if comma-separated (multiple proxies)
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
 * Build an OAuth2 client using a placeholder redirect URI (for token loading only).
 * setCredentials doesn't use the redirect endpoint.
 */
export function getOAuth2Client() {
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
