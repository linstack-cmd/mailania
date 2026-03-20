/**
 * Passkey (WebAuthn) authentication routes.
 *
 * Provides registration and authentication flows using @simplewebauthn/server.
 *
 * Routes:
 *   POST /auth/passkey/register-options  — start registration (logged-in user)
 *   POST /auth/passkey/register-verify   — complete registration
 *   POST /auth/passkey/login-options     — start authentication
 *   POST /auth/passkey/login-verify      — complete authentication
 */

import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";
import { getPool } from "./db.js";
import { getConfig, type AppConfig } from "./config.js";

/**
 * Resolve the WebAuthn Relying Party ID and origin from config or request.
 */
function getRpConfig(config: AppConfig) {
  // RP ID should be the domain without port
  // Origin should be the full URL with protocol
  let rpId = config.webauthnRpId || "localhost";
  let origin = config.webauthnOrigin || `http://localhost:${config.port}`;

  if (config.frontendOrigin) {
    try {
      const url = new URL(config.frontendOrigin);
      rpId = config.webauthnRpId || url.hostname;
      origin = config.webauthnOrigin || config.frontendOrigin;
    } catch {
      // Fall through to defaults
    }
  }

  return { rpId, rpName: "Mailania", origin };
}

export function createPasskeyRouter(): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // POST /auth/passkey/register-options
  // Start passkey registration (user must be logged in)
  // -----------------------------------------------------------------------
  router.post("/register-options", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        res.status(401).json({ error: "Must be logged in to register a passkey" });
        return;
      }

      const pool = getPool();
      const config = getConfig();
      const { rpId, rpName } = getRpConfig(config);

      // Get user info
      const userResult = await pool.query(
        `SELECT "id", "display_name", "email" FROM "mailania_user" WHERE "id" = $1`,
        [userId],
      );
      if (userResult.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const user = userResult.rows[0];

      // Get existing credentials for exclusion
      const credResult = await pool.query(
        `SELECT "id", "transports" FROM "passkey_credential" WHERE "user_id" = $1`,
        [userId],
      );

      const excludeCredentials = credResult.rows.map((c) => ({
        id: c.id,
        transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
      }));

      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName: user.email || user.display_name,
        userDisplayName: user.display_name,
        userID: new TextEncoder().encode(userId),
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        attestationType: "none",
      });

      // Store challenge in session
      req.session.passkeyChallenge = options.challenge;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json(options);
    } catch (err: any) {
      console.error("[Passkey] Register options error:", err);
      res.status(500).json({ error: "Failed to generate registration options" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /auth/passkey/register-verify
  // Complete passkey registration
  // -----------------------------------------------------------------------
  router.post("/register-verify", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        res.status(401).json({ error: "Must be logged in to register a passkey" });
        return;
      }

      const challenge = req.session.passkeyChallenge;
      if (!challenge) {
        res.status(400).json({ error: "No registration challenge found — start over" });
        return;
      }

      const config = getConfig();
      const { rpId, origin } = getRpConfig(config);

      const verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ error: "Registration verification failed" });
        return;
      }

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;

      // Store credential in DB
      const pool = getPool();
      await pool.query(
        `INSERT INTO "passkey_credential"
           ("id", "user_id", "public_key", "counter", "device_type", "backed_up", "transports")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          credential.id,
          userId,
          Buffer.from(credential.publicKey),
          credential.counter,
          credentialDeviceType,
          credentialBackedUp,
          JSON.stringify(credential.transports ?? []),
        ],
      );

      // Clear challenge
      delete req.session.passkeyChallenge;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json({ verified: true });
    } catch (err: any) {
      console.error("[Passkey] Register verify error:", err);
      res.status(500).json({ error: "Registration verification failed" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /auth/passkey/login-options
  // Start passkey authentication (no login required)
  // -----------------------------------------------------------------------
  router.post("/login-options", async (req, res) => {
    try {
      const config = getConfig();
      const { rpId } = getRpConfig(config);

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: "preferred",
        // Don't specify allowCredentials — let the browser show all available passkeys
      });

      // Store challenge in session
      req.session.passkeyChallenge = options.challenge;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json(options);
    } catch (err: any) {
      console.error("[Passkey] Login options error:", err);
      res.status(500).json({ error: "Failed to generate authentication options" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /auth/passkey/login-verify
  // Complete passkey authentication
  // -----------------------------------------------------------------------
  router.post("/login-verify", async (req, res) => {
    try {
      const challenge = req.session.passkeyChallenge;
      if (!challenge) {
        res.status(400).json({ error: "No authentication challenge found — start over" });
        return;
      }

      const config = getConfig();
      const { rpId, origin } = getRpConfig(config);
      const pool = getPool();

      // Look up the credential
      const credentialId = req.body.id;
      const credResult = await pool.query(
        `SELECT c.*, u."display_name", u."email"
         FROM "passkey_credential" c
         JOIN "mailania_user" u ON u."id" = c."user_id"
         WHERE c."id" = $1`,
        [credentialId],
      );

      if (credResult.rows.length === 0) {
        res.status(400).json({ error: "Credential not found" });
        return;
      }

      const stored = credResult.rows[0];

      const verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: {
          id: stored.id,
          publicKey: stored.public_key,
          counter: Number(stored.counter),
          transports: (stored.transports ?? []) as AuthenticatorTransportFuture[],
        },
      });

      if (!verification.verified) {
        res.status(400).json({ error: "Authentication verification failed" });
        return;
      }

      // Update counter
      await pool.query(
        `UPDATE "passkey_credential" SET "counter" = $1 WHERE "id" = $2`,
        [verification.authenticationInfo.newCounter, credentialId],
      );

      // Set session
      req.session.userId = stored.user_id;

      // Load the user's primary Gmail account if any
      const gmailResult = await pool.query(
        `SELECT "id" FROM "gmail_account"
         WHERE "user_id" = $1
         ORDER BY "is_primary" DESC, "created_at" ASC
         LIMIT 1`,
        [stored.user_id],
      );
      if (gmailResult.rows.length > 0) {
        req.session.activeGmailAccountId = gmailResult.rows[0].id;
      }

      // Clear challenge
      delete req.session.passkeyChallenge;

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json({
        verified: true,
        user: {
          id: stored.user_id,
          displayName: stored.display_name,
          email: stored.email,
        },
      });
    } catch (err: any) {
      console.error("[Passkey] Login verify error:", err);
      res.status(500).json({ error: "Authentication verification failed" });
    }
  });

  return router;
}
