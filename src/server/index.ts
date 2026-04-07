import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { loadConfig, getConfig } from "./config.js";
import { initDb, getPool } from "./db.js";
import {
  getAuthUrl,
  exchangeCode,
  loadGmailClient,
  isAuthenticated,
  getUserId,
  getUser,
  getUserGmailAccounts,
  switchGmailAccount,
  unlinkGmailAccount,
  logout,
} from "./auth.js";
import { listInbox } from "./gmail.js";
import { getGmailAuthFailure } from "./gmail-auth-errors.js";
import { MOCK_INBOX_MESSAGES, MOCK_GENERAL_CHAT_MESSAGES, MOCK_SUGGESTIONS } from "./mock-data.js";
import type { TriageSuggestion } from "./agent-tools.js";
import { createToolsRouter } from "./tools-routes.js";
import { createChatRouter } from "./chat-routes.js";
import { createPasskeyRouter } from "./passkey-routes.js";
import {
  getUserTriagePreferences,
  updateUserTriagePreferences,
} from "./user-preferences.js";

const TRIAGE_MAX_UNREAD_MESSAGES = 100;

async function main() {
  const config = await loadConfig();
  await initDb(config.databaseUrl);

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());

  // --- Session middleware (DB-backed via connect-pg-simple) ---
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool: getPool(),
        tableName: "session",
        pruneSessionInterval: 15 * 60,
      }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        secure: "auto",
        sameSite: "lax",
      },
      name: "mailania.sid",
    }),
  );

  // --- Passkey routes (always available) ---
  app.use("/auth/passkey", createPasskeyRouter());

  // --- API Routes ---

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, localDev: config.localDevNoAuth });
  });

  // -----------------------------------------------------------------------
  // LOCAL DEV NO-AUTH MODE
  // -----------------------------------------------------------------------

  if (config.localDevNoAuth) {
    console.log(
      "[Dev] Local dev routes active — auth bypassed, mock inbox enabled",
    );

    // Create a dev user on first request if needed
    let devUserId: string | null = null;

    async function seedMockChatMessages(userId: string): Promise<void> {
      const pool = getPool();
      // Check if a general conversation already exists
      const existing = await pool.query(
        `SELECT "id" FROM "suggestion_conversation"
         WHERE "scope" = 'general' AND "user_id" = $1
         LIMIT 1`,
        [userId],
      );
      if (existing.rows.length > 0) return; // Already seeded

      // Create a general conversation
      const convResult = await pool.query(
        `INSERT INTO "suggestion_conversation" ("scope", "run_id", "suggestion_index", "user_id")
         VALUES ('general', NULL, NULL, $1)
         RETURNING "id"`,
        [userId],
      );
      const conversationId = convResult.rows[0].id as string;

      // Insert mock messages with staggered timestamps
      const baseTime = Date.now() - MOCK_GENERAL_CHAT_MESSAGES.length * 60_000;
      for (let i = 0; i < MOCK_GENERAL_CHAT_MESSAGES.length; i++) {
        const msg = MOCK_GENERAL_CHAT_MESSAGES[i];
        const createdAt = new Date(baseTime + i * 60_000).toISOString();
        await pool.query(
          `INSERT INTO "suggestion_message" ("conversation_id", "role", "content", "created_at")
           VALUES ($1, $2, $3, $4)`,
          [conversationId, msg.role, msg.content, createdAt],
        );
      }
      console.log(`[Dev] Seeded ${MOCK_GENERAL_CHAT_MESSAGES.length} mock chat messages`);
    }

    async function seedMockSuggestions(userId: string): Promise<void> {
      const pool = getPool();
      // Check if suggestions already exist for this user
      const existing = await pool.query(
        `SELECT "id" FROM "suggestion"
         WHERE "user_id" = $1
         LIMIT 1`,
        [userId],
      );
      if (existing.rows.length > 0) return; // Already seeded

      // Insert mock suggestions
      for (const suggestion of MOCK_SUGGESTIONS) {
        await pool.query(
          `INSERT INTO "suggestion" ("user_id", "suggestion_json", "status")
           VALUES ($1, $2, 'pending')`,
          [userId, JSON.stringify(suggestion)],
        );
      }
      console.log(`[Dev] Seeded ${MOCK_SUGGESTIONS.length} mock suggestions`);
    }

    async function ensureDevUser(): Promise<string> {
      if (devUserId) return devUserId;
      const pool = getPool();
      const existing = await pool.query(
        `SELECT "id" FROM "mailania_user" WHERE "email" = 'dev@localhost'`,
      );
      if (existing.rows.length > 0) {
        devUserId = existing.rows[0].id;
      } else {
        const created = await pool.query(
          `INSERT INTO "mailania_user" ("display_name", "email")
           VALUES ('Dev User', 'dev@localhost')
           RETURNING "id"`,
        );
        devUserId = created.rows[0].id;
      }
      // Seed mock chat messages (idempotent)
      await seedMockChatMessages(devUserId!);
      // Seed mock suggestions (idempotent)
      await seedMockSuggestions(devUserId!);
      return devUserId!;
    }

    // Middleware: ensure dev user is set in session
    app.use(async (req, _res, next) => {
      if (!req.session.userId) {
        req.session.userId = await ensureDevUser();
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
      }
      next();
    });

    app.get("/api/status", (req, res) => {
      res.json({
        authenticated: true,
        localDev: true,
        user: { id: req.session.userId, displayName: "Dev User", email: "dev@localhost" },
        gmailConnected: false,
        hasPasskey: false,
      });
    });

    app.get("/api/inbox", (_req, res) => {
      res.json({ messages: MOCK_INBOX_MESSAGES });
    });

    app.get("/api/account/triage-preferences", async (req, res) => {
      try {
        const userId = req.session.userId!;
        const triagePreferences = await getUserTriagePreferences(userId);
        res.json({ triagePreferences });
      } catch (err) {
        console.error("[Account] Failed to fetch triage preferences:", err);
        res.status(500).json({ error: "Failed to fetch triage preferences" });
      }
    });

    app.patch("/api/account/triage-preferences", async (req, res) => {
      try {
        const userId = req.session.userId!;
        const triagePreferences = await updateUserTriagePreferences(userId, req.body?.triagePreferences);
        res.json({ ok: true, triagePreferences });
      } catch (err: any) {
        if (err instanceof Error && err.message.includes("characters or fewer")) {
          res.status(400).json({ error: err.message });
          return;
        }
        console.error("[Account] Failed to update triage preferences:", err);
        res.status(500).json({ error: "Failed to update triage preferences" });
      }
    });

    app.get("/api/suggestions", async (req, res) => {
      try {
        const userId = req.session.userId!;
        const result = await getPool().query(
          `SELECT "id", "suggestion_json", "status", "created_at", "updated_at"
           FROM "suggestion"
           WHERE "user_id" = $1 AND "status" = 'pending'
           ORDER BY "created_at" DESC`,
          [userId],
        );

        res.json({
          suggestions: result.rows.map((row) => ({
            id: row.id,
            suggestion: row.suggestion_json as TriageSuggestion,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        });
      } catch (err) {
        console.error("[Suggestions] Fetch error:", err);
        res.status(500).json({ error: "Failed to fetch suggestions" });
      }
    });

    app.patch("/api/suggestions/:id/status", async (req, res) => {
      try {
        const userId = req.session.userId!;
        const { id } = req.params;
        const { status } = req.body;

        if (!["pending", "accepted", "dismissed"].includes(status)) {
          res.status(400).json({ error: "Invalid status" });
          return;
        }

        const result = await getPool().query(
          `UPDATE "suggestion" SET "status" = $1, "updated_at" = now()
           WHERE "id" = $2 AND "user_id" = $3
           RETURNING "id", "status"`,
          [status, id, userId],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ error: "Suggestion not found" });
          return;
        }

        const row = result.rows[0];
        res.json({ id: row.id, status: row.status });
      } catch (err) {
        console.error("[Suggestions] Update error:", err);
        res.status(500).json({ error: "Failed to update suggestion" });
      }
    });

    app.get("/auth/login", (_req, res) => res.redirect("/"));
    app.get("/auth/callback", (_req, res) => res.redirect("/"));
    app.get("/auth/logout", (_req, res) => res.json({ ok: true, localDev: true }));
  } else {
    // -----------------------------------------------------------------------
    // PRODUCTION MODE — proper auth with user accounts
    // -----------------------------------------------------------------------

    app.get("/api/status", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) {
        res.json({ authenticated: false });
        return;
      }

      const [user, gmailAccounts, passkeyCount] = await Promise.all([
        getUser(userId),
        getUserGmailAccounts(userId),
        getPool().query(
          `SELECT COUNT(*)::int as count FROM "passkey_credential" WHERE "user_id" = $1`,
          [userId],
        ),
      ]);

      res.json({
        authenticated: true,
        user: user ? { id: user.id, displayName: user.display_name, email: user.email } : null,
        gmailAccounts: gmailAccounts.map((a) => ({
          id: a.id,
          email: a.email,
          isPrimary: a.is_primary,
          isActive: a.id === req.session.activeGmailAccountId,
        })),
        gmailConnected: gmailAccounts.length > 0,
        hasPasskey: passkeyCount.rows[0].count > 0,
        activeGmailAccountId: req.session.activeGmailAccountId,
      });
    });

    // --- Account management routes ---

    app.get("/api/account/gmail-accounts", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const accounts = await getUserGmailAccounts(userId);
      res.json({
        accounts: accounts.map((a) => ({
          id: a.id,
          email: a.email,
          isPrimary: a.is_primary,
          isActive: a.id === req.session.activeGmailAccountId,
        })),
      });
    });

    app.post("/api/account/switch-gmail", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const { gmailAccountId } = req.body;
      if (!gmailAccountId) {
        res.status(400).json({ error: "gmailAccountId required" });
        return;
      }

      const success = await switchGmailAccount(req, gmailAccountId);
      if (!success) {
        res.status(404).json({ error: "Gmail account not found" });
        return;
      }

      res.json({ ok: true, activeGmailAccountId: gmailAccountId });
    });

    app.get("/api/account/triage-preferences", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      try {
        const triagePreferences = await getUserTriagePreferences(userId);
        res.json({ triagePreferences });
      } catch (err) {
        console.error("[Account] Failed to fetch triage preferences:", err);
        res.status(500).json({ error: "Failed to fetch triage preferences" });
      }
    });

    app.patch("/api/account/triage-preferences", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      try {
        const triagePreferences = await updateUserTriagePreferences(userId, req.body?.triagePreferences);
        res.json({ ok: true, triagePreferences });
      } catch (err: any) {
        if (err instanceof Error && err.message.includes("characters or fewer")) {
          res.status(400).json({ error: err.message });
          return;
        }
        console.error("[Account] Failed to update triage preferences:", err);
        res.status(500).json({ error: "Failed to update triage preferences" });
      }
    });

    // --- Passkey management routes ---

    app.get("/api/account/passkeys", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      try {
        const pool = getPool();
        const result = await pool.query(
          `SELECT "id", "device_type", "backed_up", "transports", "name", "created_at"
           FROM "passkey_credential"
           WHERE "user_id" = $1
           ORDER BY "created_at" ASC`,
          [userId],
        );
        res.json({
          passkeys: result.rows.map((row) => ({
            id: row.id,
            name: row.name || null,
            deviceType: row.device_type,
            backedUp: row.backed_up,
            transports: row.transports ?? [],
            createdAt: row.created_at,
          })),
        });
      } catch (err) {
        console.error("[Passkey] List error:", err);
        res.status(500).json({ error: "Failed to list passkeys" });
      }
    });

    app.patch("/api/account/passkeys/:credentialId", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const credentialId = req.params.credentialId;
      const { name } = req.body;

      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      if (name.trim().length > 100) {
        res.status(400).json({ error: "Name must be 100 characters or fewer" });
        return;
      }

      try {
        const pool = getPool();
        const result = await pool.query(
          `UPDATE "passkey_credential" SET "name" = $1 WHERE "id" = $2 AND "user_id" = $3 RETURNING "id"`,
          [name.trim(), credentialId, userId],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ error: "Passkey not found" });
          return;
        }

        res.json({ ok: true, name: name.trim() });
      } catch (err) {
        console.error("[Passkey] Rename error:", err);
        res.status(500).json({ error: "Failed to rename passkey" });
      }
    });

    app.delete("/api/account/passkeys/:credentialId", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const credentialId = req.params.credentialId;
      if (!credentialId) {
        res.status(400).json({ error: "Credential ID required" });
        return;
      }

      try {
        const pool = getPool();

        // Count total passkeys for this user
        const countResult = await pool.query(
          `SELECT COUNT(*)::int as count FROM "passkey_credential" WHERE "user_id" = $1`,
          [userId],
        );
        const totalPasskeys = countResult.rows[0].count;

        if (totalPasskeys <= 1) {
          res.status(409).json({
            error: "Cannot delete your only passkey. Register another passkey first — it's your only way to sign in.",
          });
          return;
        }

        // Verify the credential belongs to this user before deleting
        const deleteResult = await pool.query(
          `DELETE FROM "passkey_credential" WHERE "id" = $1 AND "user_id" = $2 RETURNING "id"`,
          [credentialId, userId],
        );

        if (deleteResult.rowCount === 0) {
          res.status(404).json({ error: "Passkey not found" });
          return;
        }

        res.json({ ok: true });
      } catch (err) {
        console.error("[Passkey] Delete error:", err);
        res.status(500).json({ error: "Failed to delete passkey" });
      }
    });

    app.post("/api/account/unlink-gmail", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const { gmailAccountId } = req.body;
      if (!gmailAccountId) {
        res.status(400).json({ error: "gmailAccountId required" });
        return;
      }

      const success = await unlinkGmailAccount(userId, gmailAccountId);
      if (!success) {
        res.status(404).json({ error: "Gmail account not found" });
        return;
      }

      // If we just unlinked the active account, clear it
      if (req.session.activeGmailAccountId === gmailAccountId) {
        delete req.session.activeGmailAccountId;
        // Try to switch to another account
        const remaining = await getUserGmailAccounts(userId);
        if (remaining.length > 0) {
          req.session.activeGmailAccountId = remaining[0].id;
        }
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
      }

      res.json({ ok: true });
    });

    // --- Gmail data routes ---

    app.get("/api/inbox", async (req, res) => {
      const auth = await loadGmailClient(req);
      if (!auth) {
        res.status(401).json({
          error: "No Gmail account connected",
          code: "NO_GMAIL_ACCOUNT",
        });
        return;
      }

      try {
        const messages = await listInbox(auth, config.inboxLimit);
        res.json({ messages });
      } catch (err: any) {
        const authFailure = getGmailAuthFailure(err);
        if (authFailure) {
          res.status(authFailure.status).json(authFailure);
          return;
        }
        console.error("Gmail API error:", err);
        res.status(500).json({ error: "Failed to fetch inbox" });
      }
    });

    // --- Suggestion endpoints ---

    app.get("/api/suggestions", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      try {
        const result = await getPool().query(
          `SELECT "id", "suggestion_json", "status", "created_at", "updated_at"
           FROM "suggestion"
           WHERE "user_id" = $1 AND "status" = 'pending'
           ORDER BY "created_at" DESC`,
          [userId],
        );

        res.json({
          suggestions: result.rows.map((row) => ({
            id: row.id,
            suggestion: row.suggestion_json as TriageSuggestion,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        });
      } catch (err) {
        console.error("[Suggestions] Fetch error:", err);
        res.status(500).json({ error: "Failed to fetch suggestions" });
      }
    });

    app.patch("/api/suggestions/:id/status", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["pending", "accepted", "dismissed"].includes(status)) {
          res.status(400).json({ error: "Invalid status" });
          return;
        }

        const update_result = await getPool().query(
          `UPDATE "suggestion" SET "status" = $1, "updated_at" = now()
           WHERE "id" = $2 AND "user_id" = $3
           RETURNING "id", "status"`,
          [status, id, userId],
        );

        if (update_result.rowCount === 0) {
          res.status(404).json({ error: "Suggestion not found" });
          return;
        }

        const row = update_result.rows[0];
        res.json({ id: row.id, status: row.status });
      } catch (err) {
        console.error("[Suggestions] Update error:", err);
        res.status(500).json({ error: "Failed to update suggestion" });
      }
    });

    // --- Auth routes ---

    // Google OAuth is ONLY for connecting Gmail accounts (user must be logged in)
    app.get("/auth/login", (req, res) => {
      if (!isAuthenticated(req)) {
        // Not logged in — redirect to home (login screen)
        const redirectUrl = config.frontendOrigin || "/";
        res.redirect(redirectUrl);
        return;
      }
      res.redirect(getAuthUrl(req));
    });

    app.get("/auth/callback", async (req, res) => {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).json({ error: "Missing authorization code" });
        return;
      }

      if (!isAuthenticated(req)) {
        res.status(401).json({ error: "Must be logged in to connect a Gmail account" });
        return;
      }

      try {
        await exchangeCode(code, req);

        if (config.frontendOrigin) {
          res.redirect(config.frontendOrigin);
          return;
        }

        const proto = req.get("x-forwarded-proto") || req.protocol;
        const host = req.get("x-forwarded-host") || req.get("host");
        if (host) {
          res.redirect(`${proto}://${host}`);
          return;
        }

        res.redirect("/");
      } catch (err) {
        console.error("OAuth callback error:", err);
        res.status(500).json({ error: "Failed to connect Gmail account" });
      }
    });

    app.get("/auth/logout", async (req, res) => {
      try {
        await logout(req);
      } catch {
        // Session already gone
      }
      res.json({ ok: true });
    });
  }

  // --- Tool API routes ---
  app.use("/api/tools", createToolsRouter());

  // --- Chat / Suggestion Conversation routes ---
  app.use("/api", createChatRouter());

  // In production, serve built frontend
  const clientDist = path.resolve("dist/client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  app.listen(config.port, () => {
    console.log(`✉️  Mailania API running at http://localhost:${config.port}`);
    if (config.localDevNoAuth) {
      console.log("🔧 Local dev mode: auth bypassed, mock inbox active");
    }
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
