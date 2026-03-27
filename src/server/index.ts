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
import { listInbox, listUnreadInbox } from "./gmail.js";
import { generateTriageSuggestions, generateTriageSuggestionsStreaming } from "./triage.js";
import { MOCK_INBOX_MESSAGES } from "./mock-data.js";
import type { TriageSuggestion, TriageProgressEvent } from "./triage.js";
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

    app.post("/api/triage/suggest", async (req, res) => {
      // Use unread-only messages for triage — fixed at up to 100 emails.
      const unreadMessages = MOCK_INBOX_MESSAGES.filter((m) => m.isRead === false);
      const messages = unreadMessages.slice(0, TRIAGE_MAX_UNREAD_MESSAGES);

      const userId = req.session.userId!;
      const triagePreferences = await getUserTriagePreferences(userId);

      if (config.anthropicApiKey) {
        try {
          const result = await generateTriageSuggestions(
            messages,
            config.anthropicApiKey,
            config.anthropicModel,
            triagePreferences,
          );

          const row = await getPool().query(
            `INSERT INTO "triage_run" ("user_id", "suggestions", "source_messages")
             VALUES ($1, $2, $3)
             RETURNING "id", "created_at"`,
            [userId, JSON.stringify(result.suggestions), JSON.stringify(messages)],
          );

          const run = row.rows[0];
          res.json({ ...result, runId: run.id, createdAt: run.created_at });
        } catch (err: any) {
          console.error("Triage suggestion error (local dev):", err);
          res.status(500).json({ error: "Failed to generate triage suggestions" });
        }
      } else {
        const mockSuggestions: TriageSuggestion[] = [
          {
            kind: "archive_bulk",
            title: "Archive 3 GitHub notification emails",
            rationale: "These are automated GitHub notifications that are typically transient.",
            confidence: "high",
            messageIds: ["mock-002", "mock-005", "mock-009"],
          },
          {
            kind: "create_filter",
            title: "Auto-label Stripe receipts",
            rationale: "Recurring payment receipts from receipts@stripe.com.",
            confidence: "medium",
            filterDraft: { from: "receipts@stripe.com", label: "Receipts", archive: false },
          },
          {
            kind: "needs_user_input",
            title: "Personal message needs attention",
            rationale: 'The email from alice@example.com about "Coffee next week?" looks personal.',
            confidence: "low",
            messageIds: ["mock-004"],
            questions: ["Do you want to keep personal emails in your inbox until replied?"],
          },
        ];

        const row = await getPool().query(
          `INSERT INTO "triage_run" ("user_id", "suggestions", "source_messages")
           VALUES ($1, $2, $3)
           RETURNING "id", "created_at"`,
          [userId, JSON.stringify(mockSuggestions), JSON.stringify(messages)],
        );

        const run = row.rows[0];
        res.json({ suggestions: mockSuggestions, runId: run.id, createdAt: run.created_at });
      }
    });

    // --- Streaming triage endpoint (SSE) --- local dev
    app.post("/api/triage/suggest-stream", async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (event: TriageProgressEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unreadMessages = MOCK_INBOX_MESSAGES.filter((m) => m.isRead === false);
      const messages = unreadMessages.slice(0, TRIAGE_MAX_UNREAD_MESSAGES);
      const userId = req.session.userId!;
      const triagePreferences = await getUserTriagePreferences(userId);

      if (messages.length === 0) {
        sendEvent({ type: "complete", percent: 100, totalMessages: 0, suggestionsCount: 0, suggestions: [] });
        res.end();
        return;
      }

      if (config.anthropicApiKey) {
        try {
          const result = await generateTriageSuggestionsStreaming(
            messages,
            config.anthropicApiKey,
            config.anthropicModel,
            sendEvent,
            triagePreferences,
          );

          const row = await getPool().query(
            `INSERT INTO "triage_run" ("user_id", "suggestions", "source_messages")
             VALUES ($1, $2, $3)
             RETURNING "id", "created_at"`,
            [userId, JSON.stringify(result.suggestions), JSON.stringify(messages)],
          );

          const run = row.rows[0];
          sendEvent({
            type: "complete",
            percent: 100,
            totalMessages: messages.length,
            suggestionsCount: result.suggestions.length,
            suggestions: result.suggestions,
            stage: "Done",
          });
          // Send run metadata as a separate event
          res.write(`data: ${JSON.stringify({ type: "saved", runId: run.id, createdAt: run.created_at })}\n\n`);
        } catch (err: any) {
          sendEvent({ type: "error", error: err.message || "Failed to generate triage suggestions" });
        }
      } else {
        // Mock mode — simulate progress
        sendEvent({ type: "progress", stage: "Analyzing 5 unread messages…", percent: 10, totalMessages: messages.length, totalBatches: 1, currentBatch: 1, suggestionsCount: 0 });

        const mockSuggestions: TriageSuggestion[] = [
          {
            kind: "archive_bulk",
            title: "Archive 3 GitHub notification emails",
            rationale: "These are automated GitHub notifications that are typically transient.",
            confidence: "high",
            messageIds: ["mock-002", "mock-005", "mock-009"],
          },
          {
            kind: "create_filter",
            title: "Auto-label Stripe receipts",
            rationale: "Recurring payment receipts from receipts@stripe.com.",
            confidence: "medium",
            filterDraft: { from: "receipts@stripe.com", label: "Receipts", archive: false },
          },
          {
            kind: "needs_user_input",
            title: "Personal message needs attention",
            rationale: 'The email from alice@example.com about "Coffee next week?" looks personal.',
            confidence: "low",
            messageIds: ["mock-004"],
            questions: ["Do you want to keep personal emails in your inbox until replied?"],
          },
        ];

        // Small delay for mock mode so user sees progress
        await new Promise((r) => setTimeout(r, 800));

        const row = await getPool().query(
          `INSERT INTO "triage_run" ("user_id", "suggestions", "source_messages")
           VALUES ($1, $2, $3)
           RETURNING "id", "created_at"`,
          [userId, JSON.stringify(mockSuggestions), JSON.stringify(messages)],
        );

        const run = row.rows[0];
        sendEvent({ type: "complete", percent: 100, totalMessages: messages.length, suggestionsCount: mockSuggestions.length, suggestions: mockSuggestions, stage: "Done" });
        res.write(`data: ${JSON.stringify({ type: "saved", runId: run.id, createdAt: run.created_at })}\n\n`);
      }

      res.end();
    });

    app.get("/api/triage/latest", async (req, res) => {
      try {
        const userId = req.session.userId!;
        const result = await getPool().query(
          `SELECT "id", "created_at", "suggestions"
           FROM "triage_run"
           WHERE "user_id" = $1
           ORDER BY "created_at" DESC
           LIMIT 1`,
          [userId],
        );

        if (result.rows.length === 0) {
          res.json({ suggestions: null, runId: null, createdAt: null });
          return;
        }

        const run = result.rows[0];
        res.json({
          suggestions: run.suggestions as TriageSuggestion[],
          runId: run.id,
          createdAt: run.created_at,
        });
      } catch (err) {
        console.error("Triage latest fetch error:", err);
        res.status(500).json({ error: "Failed to fetch latest triage run" });
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
        res.status(401).json({ error: "No Gmail account connected" });
        return;
      }

      try {
        const messages = await listInbox(auth, config.inboxLimit);
        res.json({ messages });
      } catch (err: any) {
        if (err?.code === 401 || err?.response?.status === 401) {
          res.status(401).json({ error: "Gmail token expired — please reconnect" });
          return;
        }
        console.error("Gmail API error:", err);
        res.status(500).json({ error: "Failed to fetch inbox" });
      }
    });

    // --- Triage Suggestions ---

    app.post("/api/triage/suggest", async (req, res) => {
      if (!config.anthropicApiKey) {
        res.status(503).json({ error: "Triage unavailable — ANTHROPIC_API_KEY not configured" });
        return;
      }

      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const auth = await loadGmailClient(req);
      if (!auth) {
        res.status(401).json({ error: "No Gmail account connected" });
        return;
      }

      try {
        // Unread-only triage — fixed at up to 100 emails.
        const messages = await listUnreadInbox(auth, TRIAGE_MAX_UNREAD_MESSAGES);
        const triagePreferences = await getUserTriagePreferences(userId);

        const result = await generateTriageSuggestions(
          messages,
          config.anthropicApiKey,
          config.anthropicModel,
          triagePreferences,
        );

        const row = await getPool().query(
          `INSERT INTO "triage_run" ("user_id", "gmail_account_id", "suggestions", "source_messages")
           VALUES ($1, $2, $3, $4)
           RETURNING "id", "created_at"`,
          [
            userId,
            req.session.activeGmailAccountId ?? null,
            JSON.stringify(result.suggestions),
            JSON.stringify(messages),
          ],
        );

        const run = row.rows[0];
        res.json({ ...result, runId: run.id, createdAt: run.created_at });
      } catch (err: any) {
        if (err?.code === 401 || err?.response?.status === 401) {
          res.status(401).json({ error: "Gmail token expired" });
          return;
        }
        if (err?.status) {
          console.error("Anthropic API error:", err.status, err.message);
          res.status(502).json({ error: "LLM request failed", detail: err.message });
          return;
        }
        console.error("Triage suggestion error:", err);
        res.status(500).json({ error: "Failed to generate triage suggestions" });
      }
    });

    // --- Streaming triage endpoint (SSE) --- production
    app.post("/api/triage/suggest-stream", async (req, res) => {
      if (!config.anthropicApiKey) {
        res.status(503).json({ error: "Triage unavailable — ANTHROPIC_API_KEY not configured" });
        return;
      }

      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const auth = await loadGmailClient(req);
      if (!auth) {
        res.status(401).json({ error: "No Gmail account connected" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (event: TriageProgressEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        sendEvent({ type: "progress", stage: "Loading unread emails…", percent: 2, totalMessages: 0, suggestionsCount: 0 });

        const messages = await listUnreadInbox(auth, TRIAGE_MAX_UNREAD_MESSAGES);
        const triagePreferences = await getUserTriagePreferences(userId);

        if (messages.length === 0) {
          sendEvent({ type: "complete", percent: 100, totalMessages: 0, suggestionsCount: 0, suggestions: [] });
          res.end();
          return;
        }

        const result = await generateTriageSuggestionsStreaming(
          messages,
          config.anthropicApiKey,
          config.anthropicModel,
          sendEvent,
          triagePreferences,
        );

        const row = await getPool().query(
          `INSERT INTO "triage_run" ("user_id", "gmail_account_id", "suggestions", "source_messages")
           VALUES ($1, $2, $3, $4)
           RETURNING "id", "created_at"`,
          [
            userId,
            req.session.activeGmailAccountId ?? null,
            JSON.stringify(result.suggestions),
            JSON.stringify(messages),
          ],
        );

        const run = row.rows[0];
        res.write(`data: ${JSON.stringify({ type: "saved", runId: run.id, createdAt: run.created_at })}\n\n`);
      } catch (err: any) {
        sendEvent({ type: "error", error: err.message || "Failed to generate triage suggestions" });
      }

      res.end();
    });

    app.get("/api/triage/latest", async (req, res) => {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      try {
        const result = await getPool().query(
          `SELECT "id", "created_at", "suggestions"
           FROM "triage_run"
           WHERE "user_id" = $1
           ORDER BY "created_at" DESC
           LIMIT 1`,
          [userId],
        );

        if (result.rows.length === 0) {
          res.json({ suggestions: null, runId: null, createdAt: null });
          return;
        }

        const run = result.rows[0];
        res.json({
          suggestions: run.suggestions as TriageSuggestion[],
          runId: run.id,
          createdAt: run.created_at,
        });
      } catch (err) {
        console.error("Triage latest fetch error:", err);
        res.status(500).json({ error: "Failed to fetch latest triage run" });
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
  app.use("/api/suggestions", createChatRouter());

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
