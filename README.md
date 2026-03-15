# 📬 Mailania

Minimal Gmail web client with Google OAuth and inbox listing. Built with React, Express, [Flow CSS](https://github.com/0916dhkim/flow-css), and Vite. Designed as a web app foundation with future mobile compatibility in mind.

## Product Direction (Core)

Mailania's goal is to give users a **fast way to organize inbox** through a collaborative AI triage workflow.

### AI triage principles

- The LLM can triage and **suggest** actions, but must **not archive/delete emails autonomously**.
- Mailania should collaborate with the user to build a **personalized triage system** over time.
- The collaboration UI is the core product surface (not an afterthought).

### What the agent should suggest

- Bulk archive specific emails (with clear rationale and preview)
- Create/update Gmail filters (with explicit user review before applying)

### UX requirements for suggestions

- Every suggestion should include enough context to decide confidently (sender, subject, snippet, reason, impact).
- User feedback should be first-class (approve, reject, edit criteria, explain why).
- When confidence is low or intent is unclear, the agent should ask/discuss rather than force an action.

## Architecture

- **Frontend:** React + Vite + Flow CSS (theme-driven, zero-class styling)
- **Backend:** Express API server (OAuth flow, Gmail API proxy)
- **Secrets:** [Secret Party](https://github.com/0916dhkim/secret-party) as single source of truth for encrypted secret management
- **Deploy:** Dockerfile included, Dokploy-ready

```
mailania/
├── src/
│   ├── server/
│   │   ├── index.ts          # Routes & server startup
│   │   ├── config.ts         # Config loader (Secret Party for OAuth + LLM config)
│   │   ├── secret-party.ts   # Secret Party API client & decryption
│   │   ├── auth.ts           # OAuth2 token management
│   │   ├── gmail.ts          # Gmail API wrapper
│   │   └── triage.ts         # AI triage suggestions (Claude, read-only)
│   └── client/
│       ├── main.tsx          # Entry point
│       ├── App.tsx           # UI (login + inbox)
│       ├── styles.css        # Global styles + @flow-css directive
│       └── theme.ts          # Flow CSS theme tokens
├── index.html
├── vite.config.ts
├── Dockerfile
├── .env.example
└── package.json
```

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select existing) → enable the **Gmail API**
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs:
   - `http://localhost:3001/auth/callback` (local)
   - `https://mailania.probablydanny.com/auth/callback` (Dokploy)
6. Copy the **Client ID** and **Client Secret**

> If the app is in "Testing" mode, add your Gmail address under **OAuth consent screen → Test users**.

### 2. Configure

```bash
cp .env.example .env
```

Fill in your Secret Party connection values:

```env
SECRET_PARTY_API_URL=https://secret-party.probablydanny.com
SECRET_PARTY_ENVIRONMENT_ID=your-environment-id
SECRET_PARTY_PRIVATE_KEY_BASE64=your-api-client-private-key-base64
PORT=3001
INBOX_LIMIT=25
```

And make sure these keys exist in your Secret Party environment:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FRONTEND_ORIGIN` (optional)
- `ANTHROPIC_API_KEY` (required for AI triage — see below)
- `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-4-20250514`)

### 3. Run (Development)

```bash
npm install
npm run dev
```

This starts both the API server (`:3001`) and Vite dev server (`:5173`) concurrently. Open [http://localhost:5173](http://localhost:5173).

- Click **Sign in with Google** → authorize → see your inbox
- Token persists in `token.json` across restarts

### 4. Run (Production)

```bash
npm run build
npm start
```

Serves the built frontend + API on a single port (`:3001`).

### 5. Deploy (Docker / Dokploy)

```bash
docker build -t mailania .
docker run -p 3001:3001 --env-file .env mailania
```

#### Dokploy checklist

1. Create app from this repo: `linstack-cmd/mailania`
2. Build mode: Dockerfile
3. Expose internal port: `3001`
4. Set domain: `mailania.probablydanny.com`
5. Add environment variables (Secret Party required)
6. Deploy
7. Verify health: `https://mailania.probablydanny.com/healthz`
8. Sign in flow should return to app home after Google auth

---

## Secret Party Integration

Mailania uses [Secret Party](https://github.com/0916dhkim/secret-party) for encrypted secret management. OAuth credentials are fetched and decrypted from Secret Party at server startup; plaintext `GOOGLE_*` env vars are not used.

### How it works

- Mailania performs a **runtime fetch** from Secret Party once at startup.
- If Secret Party is unreachable or required keys are missing, startup fails fast with a clear error.
- Secrets are never baked into the image or committed to env files.

### Setup

1. **Create an API client** in Secret Party for the Mailania project/environment
2. **Save the private key** (base64-encoded PKCS8) — this is the only secret you store as an env var
3. **Store your Google credentials** as secrets in Secret Party:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `FRONTEND_ORIGIN` (optional)
4. **Set required env vars** in Dokploy (or `.env`):

```env
SECRET_PARTY_API_URL=https://secret-party.probablydanny.com
SECRET_PARTY_ENVIRONMENT_ID=1158452150597681153
SECRET_PARTY_PRIVATE_KEY_BASE64=<your-api-client-private-key-base64>
```

### Source of truth policy

Secret Party is the only source of truth for OAuth config in Mailania.

- Required keys in Secret Party: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Optional key in Secret Party: `FRONTEND_ORIGIN`
- Plaintext `GOOGLE_*` env vars are intentionally ignored

### Redirect URI inference

Mailania always infers redirect URI per-request from reverse proxy headers:

```
{x-forwarded-proto || req.protocol}://{x-forwarded-host || Host}/auth/callback
```

This works automatically behind Traefik / Dokploy without extra config.

### Crypto details

- **Auth:** Public key (SPKI, base64) derived from the private key at runtime, sent as `Authorization: Bearer <publicKey>`
- **DEK unwrap:** RSA-OAEP (2048-bit, SHA-256) decrypt of per-environment DEK
- **Secret unwrap:** AES-256-GCM decrypt of each secret value using the DEK
- **No extra dependencies** — uses Node.js built-in `crypto` module

---

## AI Triage Suggestions

Mailania includes an LLM-powered triage assistant that analyzes your inbox and suggests organizational actions. **It is strictly read-only** — suggestions are presented for user review, never executed autonomously.

### Setup

Add your Anthropic API key to Secret Party:

- **`ANTHROPIC_API_KEY`** (required) — your Anthropic API key
- **`ANTHROPIC_MODEL`** (optional) — model to use (defaults to `claude-sonnet-4-20250514`)

If `ANTHROPIC_API_KEY` is not configured, the server starts normally but `POST /api/triage/suggest` returns `503`.

### API

```
POST /api/triage/suggest
Content-Type: application/json

# Option A: Let the server fetch current inbox
{}

# Option B: Provide messages explicitly
{
  "messages": [
    {
      "id": "msg-id",
      "subject": "Weekly newsletter",
      "from": "news@example.com",
      "date": "Mon, 10 Mar 2025 09:00:00 -0400",
      "snippet": "This week in tech..."
    }
  ]
}
```

**Response:**

```json
{
  "suggestions": [
    {
      "kind": "archive_bulk",
      "title": "Archive 5 newsletter emails",
      "rationale": "These are automated newsletters from 3 senders...",
      "confidence": "high",
      "messageIds": ["id1", "id2", "id3", "id4", "id5"]
    },
    {
      "kind": "create_filter",
      "title": "Auto-archive GitHub notifications",
      "rationale": "12 messages from notifications@github.com...",
      "confidence": "medium",
      "filterDraft": {
        "from": "notifications@github.com",
        "label": "GitHub",
        "archive": true
      }
    },
    {
      "kind": "needs_user_input",
      "title": "Unclear intent: meeting reschedule",
      "rationale": "This looks like it might need a reply...",
      "confidence": "low",
      "questions": ["Do you want to keep meeting-related emails in your inbox?"]
    }
  ]
}
```

**Suggestion kinds:**
- `archive_bulk` — batch archive with message IDs and rationale
- `create_filter` — proposed Gmail filter with draft criteria
- `needs_user_input` — ambiguous situation, asks clarifying questions

**Safety policy:** The triage endpoint never performs Gmail mutations. It uses `gmail.readonly` scope like the rest of the app. All suggestions require explicit user action through the UI.

---

## Notes

- Uses `gmail.readonly` scope — Mailania can only read, never send or modify
- Flow CSS handles all styling via theme tokens and `css()` calls — no class names or external CSS framework
- Token stored in `token.json` (gitignored); delete to re-authenticate
- In production, the Express server serves the Vite-built frontend as static files
- Secret values are never logged; only key names appear in startup logs
