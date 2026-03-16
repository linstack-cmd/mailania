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
  loadToken,
  isAuthenticated,
  logout,
} from "./auth.js";
import { listInbox } from "./gmail.js";
import { generateTriageSuggestions } from "./triage.js";
import { MOCK_INBOX_MESSAGES } from "./mock-data.js";
import type { TriageSuggestion } from "./triage.js";
import { createToolsRouter } from "./tools-routes.js";
import { createChatRouter } from "./chat-routes.js";

async function main() {
  // Load config (fetches secrets from Secret Party if configured)
  const config = await loadConfig();

  // Initialize database and create tables
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
        // Prune expired sessions every 15 minutes
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

  // --- API Routes ---

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, localDev: config.localDevNoAuth });
  });

  // -----------------------------------------------------------------------
  // LOCAL DEV NO-AUTH MODE
  // When LOCAL_DEV_NO_AUTH=true, bypass Google OAuth entirely and serve
  // mock data. Production behavior is completely unchanged when the flag
  // is off (default).
  // -----------------------------------------------------------------------

  if (config.localDevNoAuth) {
    console.log(
      "[Dev] Local dev routes active — auth bypassed, mock inbox enabled",
    );

    app.get("/api/status", (_req, res) => {
      res.json({ authenticated: true, localDev: true });
    });

    app.get("/api/inbox", (_req, res) => {
      res.json({ messages: MOCK_INBOX_MESSAGES });
    });

    app.post("/api/triage/suggest", async (req, res) => {
      // Accept optional messages payload; default to mock inbox
      let messages = req.body?.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        messages = MOCK_INBOX_MESSAGES;
      }

      // If Anthropic key is configured, use real LLM; otherwise return
      // a static mock suggestion set so the UI is still testable.
      if (config.anthropicApiKey) {
        try {
          const result = await generateTriageSuggestions(
            messages,
            config.anthropicApiKey,
            config.anthropicModel,
          );

          const sessionId = req.sessionID;
          const row = await getPool().query(
            `INSERT INTO "triage_run" ("session_id", "suggestions", "source_messages")
             VALUES ($1, $2, $3)
             RETURNING "id", "created_at"`,
            [
              sessionId,
              JSON.stringify(result.suggestions),
              JSON.stringify(messages),
            ],
          );

          const run = row.rows[0];
          res.json({ ...result, runId: run.id, createdAt: run.created_at });
        } catch (err: any) {
          console.error("Triage suggestion error (local dev):", err);
          res
            .status(500)
            .json({ error: "Failed to generate triage suggestions" });
        }
      } else {
        // No Anthropic key — return static mock suggestions
        const mockSuggestions: TriageSuggestion[] = [
          {
            kind: "archive_bulk",
            title: "Archive 3 GitHub notification emails",
            rationale:
              "These are automated GitHub notifications (dependabot, CI, review requests) that are typically transient.",
            confidence: "high",
            messageIds: ["mock-002", "mock-005", "mock-009"],
          },
          {
            kind: "create_filter",
            title: "Auto-label Stripe receipts",
            rationale:
              "Recurring payment receipts from receipts@stripe.com — a filter can auto-label these for easy reference.",
            confidence: "medium",
            filterDraft: {
              from: "receipts@stripe.com",
              label: "Receipts",
              archive: false,
            },
          },
          {
            kind: "needs_user_input",
            title: "Personal message needs attention",
            rationale:
              'The email from alice@example.com about "Coffee next week?" looks like personal correspondence that may need a reply.',
            confidence: "low",
            messageIds: ["mock-004"],
            questions: [
              "Do you want to keep personal emails in your inbox until replied?",
            ],
          },
        ];

        const sessionId = req.sessionID;
        const row = await getPool().query(
          `INSERT INTO "triage_run" ("session_id", "suggestions", "source_messages")
           VALUES ($1, $2, $3)
           RETURNING "id", "created_at"`,
          [
            sessionId,
            JSON.stringify(mockSuggestions),
            JSON.stringify(messages),
          ],
        );

        const run = row.rows[0];
        res.json({
          suggestions: mockSuggestions,
          runId: run.id,
          createdAt: run.created_at,
        });
      }
    });

    app.get("/api/triage/latest", async (req, res) => {
      try {
        const sessionId = req.sessionID;
        const result = await getPool().query(
          `SELECT "id", "created_at", "suggestions"
           FROM "triage_run"
           WHERE "session_id" = $1
           ORDER BY "created_at" DESC
           LIMIT 1`,
          [sessionId],
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

    app.get("/auth/login", (_req, res) => {
      // In local dev mode, no Google redirect — just mark session as "logged in"
      // by redirecting to home (status already reports authenticated: true)
      res.redirect("/");
    });

    app.get("/auth/callback", (_req, res) => {
      res.redirect("/");
    });

    app.get("/auth/logout", (_req, res) => {
      res.json({ ok: true, localDev: true });
    });
  } else {
    // -----------------------------------------------------------------------
    // PRODUCTION MODE — standard Google OAuth flow
    // -----------------------------------------------------------------------

    app.get("/api/status", (req, res) => {
      res.json({ authenticated: isAuthenticated(req) });
    });

    app.get("/api/inbox", async (req, res) => {
      const auth = loadToken(req);
      if (!auth) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      try {
        const messages = await listInbox(auth, config.inboxLimit);
        res.json({ messages });
      } catch (err: any) {
        if (err?.code === 401 || err?.response?.status === 401) {
          await logout(req).catch(() => {});
          res.status(401).json({ error: "Token expired" });
          return;
        }
        console.error("Gmail API error:", err);
        res.status(500).json({ error: "Failed to fetch inbox" });
      }
    });

    // --- Triage Suggestions (LLM-powered, read-only) ---

    app.post("/api/triage/suggest", async (req, res) => {
      // Check LLM availability
      if (!config.anthropicApiKey) {
        res.status(503).json({
          error:
            "Triage suggestions unavailable — ANTHROPIC_API_KEY not configured",
        });
        return;
      }

      // Check Gmail auth
      const auth = loadToken(req);
      if (!auth) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      try {
        // Accept optional messages payload; otherwise fetch from inbox
        let messages = req.body?.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
          messages = await listInbox(auth, config.inboxLimit);
        }

        const result = await generateTriageSuggestions(
          messages,
          config.anthropicApiKey,
          config.anthropicModel,
        );

        // Persist the triage run to the database
        const sessionId = req.sessionID;
        const row = await getPool().query(
          `INSERT INTO "triage_run" ("session_id", "suggestions", "source_messages")
           VALUES ($1, $2, $3)
           RETURNING "id", "created_at"`,
          [
            sessionId,
            JSON.stringify(result.suggestions),
            JSON.stringify(messages),
          ],
        );

        const run = row.rows[0];
        res.json({
          ...result,
          runId: run.id,
          createdAt: run.created_at,
        });
      } catch (err: any) {
        if (err?.code === 401 || err?.response?.status === 401) {
          await logout(req).catch(() => {});
          res.status(401).json({ error: "Token expired" });
          return;
        }

        if (err?.status) {
          console.error("Anthropic API error:", err.status, err.message);
          res.status(502).json({
            error: "LLM request failed",
            detail: err.message,
          });
          return;
        }

        if (err instanceof SyntaxError) {
          console.error("Failed to parse LLM response:", err.message);
          res.status(502).json({
            error: "LLM returned invalid response format",
          });
          return;
        }

        console.error("Triage suggestion error:", err);
        res
          .status(500)
          .json({ error: "Failed to generate triage suggestions" });
      }
    });

    // --- Latest Triage Run (read persisted suggestions) ---

    app.get("/api/triage/latest", async (req, res) => {
      if (!isAuthenticated(req)) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      try {
        const sessionId = req.sessionID;
        const result = await getPool().query(
          `SELECT "id", "created_at", "suggestions"
           FROM "triage_run"
           WHERE "session_id" = $1
           ORDER BY "created_at" DESC
           LIMIT 1`,
          [sessionId],
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
        // Session already gone — that's fine
      }
      res.json({ ok: true });
    });
  }

  // --- Tool API routes (Phase 1 + Phase 2) ---
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
      console.log(
        "🔧 Local dev mode: auth bypassed, mock inbox active, no Google OAuth needed",
      );
    }
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
