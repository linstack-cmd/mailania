import "dotenv/config";
import express from "express";
import path from "path";
import { getAuthUrl, exchangeCode, loadToken, isAuthenticated, logout } from "./auth.js";
import { listInbox } from "./gmail.js";

const app = express();
app.set("trust proxy", true);

const PORT = Number(process.env.PORT) || 3001;
const INBOX_LIMIT = Number(process.env.INBOX_LIMIT) || 25;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

// --- API Routes ---

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/status", (_req, res) => {
  res.json({ authenticated: isAuthenticated() });
});

app.get("/api/inbox", async (_req, res) => {
  const auth = loadToken();
  if (!auth) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const messages = await listInbox(auth, INBOX_LIMIT);
    res.json({ messages });
  } catch (err: any) {
    if (err?.code === 401 || err?.response?.status === 401) {
      logout();
      res.status(401).json({ error: "Token expired" });
      return;
    }
    console.error("Gmail API error:", err);
    res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

app.get("/auth/login", (_req, res) => {
  res.redirect(getAuthUrl());
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    await exchangeCode(code);

    if (FRONTEND_ORIGIN) {
      res.redirect(FRONTEND_ORIGIN);
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

app.get("/auth/logout", (_req, res) => {
  logout();
  res.json({ ok: true });
});

// In production, serve built frontend
const clientDist = path.resolve("dist/client");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✉️  Mailania API running at http://localhost:${PORT}`);
});
