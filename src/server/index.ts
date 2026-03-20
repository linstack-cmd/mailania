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
import { generateTriageSuggestions } from "./triage.js";
import { MOCK_INBOX_MESSAGES } from "./mock-data.js";
import type { TriageSuggestion } from "./triage.js";
import { createToolsRouter } from "./tools-routes.js";
import { createChatRouter } from "./chat-routes.js";
import { createPasskeyRouter } from "./passkey-routes.js";

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

    app.post("/api/triage/suggest", async (req, res) => {
      let messages = req.body?.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        messages = MOCK_INBOX_MESSAGES;
      }

      const userId = req.session.userId!;

      if (config.anthropicApiKey) {
        try {
          const result = await generateTriageSuggestions(
            messages,
            config.anthropicApiKey,
            config.anthropicModel,
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
        let messages = req.body?.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
          messages = await listInbox(auth, config.inboxLimit);
        }

        const result = await generateTriageSuggestions(
          messages,
          config.anthropicApiKey,
          config.anthropicModel,
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

    app.get("/auth/login", (req, res) => {
      res.redirect(getAuthUrl(req));
    });

    app.get("/auth/callback", async (req, res) => {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).json({ error: "Missing authorization code" });
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
        res.status(500).json({ error: "Authentication failed" });
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
