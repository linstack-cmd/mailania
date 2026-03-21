/**
 * Passkey (WebAuthn) authentication routes.
 *
 * Provides registration, signup, and authentication flows using @simplewebauthn/server.
 *
 * Routes:
 *   POST /auth/passkey/register-options  — start registration (logged-in user adds a passkey)
 *   POST /auth/passkey/register-verify   — complete registration (logged-in user)
 *   POST /auth/passkey/signup-options    — start passkey-first account creation (no login required)
 *   POST /auth/passkey/signup-verify     — complete signup + create user + set session
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

      // Store credential in DB with a default name
      const pool = getPool();

      // Determine next passkey number for this user
      const countResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM "passkey_credential" WHERE "user_id" = $1`,
        [userId],
      );
      const passkeyNumber = (countResult.rows[0].count ?? 0) + 1;
      const defaultName = `Passkey ${passkeyNumber}`;

      await pool.query(
        `INSERT INTO "passkey_credential"
           ("id", "user_id", "public_key", "counter", "device_type", "backed_up", "transports", "name")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          credential.id,
          userId,
          Buffer.from(credential.publicKey),
          credential.counter,
          credentialDeviceType,
          credentialBackedUp,
          JSON.stringify(credential.transports ?? []),
          defaultName,
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
  // POST /auth/passkey/signup-options
  // Start passkey-first account creation (no login required)
  // Body: { displayName: string }
  // -----------------------------------------------------------------------
  router.post("/signup-options", async (req, res) => {
    try {
      const { displayName } = req.body;
      if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
        res.status(400).json({ error: "Display name is required" });
        return;
      }

      const pool = getPool();
      const config = getConfig();
      const { rpId, rpName } = getRpConfig(config);

      // Create the user record now (we'll need the ID for WebAuthn userID)
      const created = await pool.query(
        `INSERT INTO "mailania_user" ("display_name")
         VALUES ($1)
         RETURNING "id"`,
        [displayName.trim()],
      );
      const userId = created.rows[0].id;

      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName: displayName.trim(),
        userDisplayName: displayName.trim(),
        userID: new TextEncoder().encode(userId),
        excludeCredentials: [],
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        attestationType: "none",
      });

      // Store challenge and pending user ID in session
      req.session.passkeyChallenge = options.challenge;
      req.session.passkeySignupUserId = userId;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json(options);
    } catch (err: any) {
      console.error("[Passkey] Signup options error:", err);
      res.status(500).json({ error: "Failed to generate signup options" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /auth/passkey/signup-verify
  // Complete passkey signup — verify credential, log in the new user
  // -----------------------------------------------------------------------
  router.post("/signup-verify", async (req, res) => {
    try {
      const challenge = req.session.passkeyChallenge;
      const pendingUserId = req.session.passkeySignupUserId;
      if (!challenge || !pendingUserId) {
        res.status(400).json({ error: "No signup challenge found — start over" });
        return;
      }

      const config = getConfig();
      const { rpId, origin } = getRpConfig(config);
      const pool = getPool();

      const verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        // Clean up the orphaned user
        await pool.query(`DELETE FROM "mailania_user" WHERE "id" = $1`, [pendingUserId]);
        res.status(400).json({ error: "Registration verification failed" });
        return;
      }

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;

      // Store credential with default name
      await pool.query(
        `INSERT INTO "passkey_credential"
           ("id", "user_id", "public_key", "counter", "device_type", "backed_up", "transports", "name")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          credential.id,
          pendingUserId,
          Buffer.from(credential.publicKey),
          credential.counter,
          credentialDeviceType,
          credentialBackedUp,
          JSON.stringify(credential.transports ?? []),
          "Passkey 1",
        ],
      );

      // Log the user in
      req.session.userId = pendingUserId;
      delete req.session.passkeyChallenge;
      delete req.session.passkeySignupUserId;

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      // Fetch user for response
      const userResult = await pool.query(
        `SELECT "id", "display_name", "email" FROM "mailania_user" WHERE "id" = $1`,
        [pendingUserId],
      );
      const user = userResult.rows[0];

      res.json({
        verified: true,
        user: {
          id: user.id,
          displayName: user.display_name,
          email: user.email,
        },
      });
    } catch (err: any) {
      console.error("[Passkey] Signup verify error:", err);
      res.status(500).json({ error: "Signup verification failed" });
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
