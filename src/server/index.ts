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
import type { TriageSuggestion } from "./triage.js";

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
    res.json({ ok: true });
  });

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
        [sessionId, JSON.stringify(result.suggestions), JSON.stringify(messages)],
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
      res.status(500).json({ error: "Failed to generate triage suggestions" });
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

  // In production, serve built frontend
  const clientDist = path.resolve("dist/client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  app.listen(config.port, () => {
    console.log(`✉️  Mailania API running at http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
