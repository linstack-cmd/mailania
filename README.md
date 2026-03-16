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
- **Sessions:** Database-backed via `connect-pg-simple` (CockroachDB/Postgres)
- **Deploy:** Dockerfile included, Dokploy-ready

```
mailania/
├── src/
│   ├── server/
│   │   ├── index.ts          # Routes & server startup
│   │   ├── config.ts         # Config loader (Secret Party for OAuth + LLM config)
│   │   ├── secret-party.ts   # Secret Party API client & decryption
│   │   ├── auth.ts           # OAuth2 token management (session-backed)
│   │   ├── db.ts             # Database connection & table init
│   │   ├── gmail.ts          # Gmail API wrapper (read + mutations)
│   │   ├── triage.ts         # AI triage suggestions (Claude, read-only)
│   │   ├── tools-routes.ts   # Tool API routes (Phase 1 + Phase 2)
│   │   ├── approval.ts       # Approval token system (Phase 2 safety gate)
│   │   └── action-log.ts     # Audit log for Phase 2 mutations
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

## Quick Start (Local Dev — No Google Account)

The fastest way to run Mailania locally. No Google OAuth, no Secret Party — just a Postgres database.

### 1. Start Postgres

```bash
# Docker one-liner (or use an existing Postgres instance)
docker run -d --name mailania-pg -p 5432:5432 \
  -e POSTGRES_USER=mailania -e POSTGRES_PASSWORD=mailania -e POSTGRES_DB=mailania \
  postgres:16
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
LOCAL_DEV_NO_AUTH=true
DATABASE_URL=postgresql://mailania:mailania@localhost:5432/mailania
PORT=3001
```

Optional — to test real LLM triage suggestions on mock data:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Without `ANTHROPIC_API_KEY`, `POST /api/triage/suggest` returns deterministic mock suggestions (useful for UI development).

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — you'll see a mock inbox with 10 realistic messages. No sign-in required.

### What's different in local dev mode

| Endpoint | Local Dev Behavior |
|---|---|
| `GET /api/status` | Always `{ authenticated: true, localDev: true }` |
| `GET /api/inbox` | Returns 10 deterministic mock messages |
| `POST /api/triage/suggest` | Uses mock inbox + real LLM (if key set) or mock suggestions |
| `GET /api/triage/latest` | Works normally (reads from DB) |
| `GET /auth/login` | Redirects to `/` (no Google redirect) |
| `GET /auth/logout` | No-op, returns `{ ok: true }` |
| `GET /healthz` | Returns `{ ok: true, localDev: true }` |
| `POST /api/tools/*` | Phase 1 endpoints use mock data; Phase 2 returns mock results with approval tokens |

### Safety guarantees

- `LOCAL_DEV_NO_AUTH` defaults to `false` — production behavior is unchanged unless explicitly enabled
- All dev-only code paths are isolated behind a single config flag check at startup
- Gmail mutations require explicit approval tokens (Phase 2 safety gate) — see Tool API section
- Mock data is deterministic and hardcoded — no external calls when auth is bypassed
- In local dev mode, Phase 2 mutations return mock results without touching Gmail

---

## Production Setup

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
- `DATABASE_URL` — CockroachDB or Postgres connection string
- `SESSION_SECRET` — random hex string for signing session cookies (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
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
- Session persists in CockroachDB/Postgres across restarts

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

## Database Sessions

Mailania stores OAuth tokens and session data in a CockroachDB/Postgres database via `connect-pg-simple`. This replaces the previous `token.json` file-based approach, enabling:

- **Multi-user support:** Each browser session has its own OAuth tokens
- **Persistence:** Sessions survive server restarts
- **Scalability:** No local filesystem dependency for auth state

### Schema

A single `session` table is created automatically at startup (idempotent):

```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL PRIMARY KEY,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

OAuth tokens are stored inside `sess.tokens` as part of the session JSON. Expired sessions are pruned every 15 minutes.

### Required secrets

- **`DATABASE_URL`** — Connection string (e.g., `postgresql://user:pass@host:26257/mailania?sslmode=verify-full`)
- **`SESSION_SECRET`** — Random hex string for signing cookies

Both can be stored in Secret Party or set as env vars (Secret Party takes precedence).

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

## Tool API (Agent-Compatible Endpoints)

Mailania exposes structured JSON endpoints under `/api/tools/` for both read-only operations (Phase 1) and human-approved mutations (Phase 2). These are designed for AI agent tool-calling but work equally well from curl or the UI.

### Phase 1 — Read-Only / Suggestion Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/tools/list_inbox` | POST | List inbox messages. Body: `{ maxResults?: number }` |
| `/api/tools/get_message` | POST | Get single message by ID. Body: `{ messageId: string }` |
| `/api/tools/search_messages` | POST | Search with Gmail query. Body: `{ query: string, maxResults?: number }` |
| `/api/tools/draft_filter_rule` | POST | Draft a filter rule (no mutation). Body: `{ from?, subject?, hasTheWord?, label?, archive?, markRead? }` |
| `/api/tools/draft_bulk_action_plan` | POST | Draft a bulk action plan. Body: `{ action: "archive"\|"label"\|"unarchive", messageIds: [...], rationale: string, label?: string }` |
| `/api/tools/save_suggestion_feedback` | POST | Save thumbs up/down. Body: `{ runId?: string, suggestionIndex: number, vote: "up"\|"down", note?: string }` |

All Phase 1 endpoints are safe to call at any time — they never modify Gmail.

### Phase 2 — Mutation Endpoints (Require Approval Token)

| Endpoint | Method | Scope | Description |
|---|---|---|---|
| `/api/tools/apply_archive_bulk` | POST | `archive_bulk` | Archive messages. Body: `{ messageIds: [...], approvalToken: string }` |
| `/api/tools/create_filter` | POST | `create_filter` | Create Gmail filter. Body: `{ rule: {...}, approvalToken: string }` |
| `/api/tools/label_messages` | POST | `label_messages` | Apply label. Body: `{ messageIds: [...], label: string, approvalToken: string }` |
| `/api/tools/unarchive` | POST | `unarchive` | Move back to inbox. Body: `{ messageIds: [...], approvalToken: string }` |

**Every Phase 2 mutation requires a valid approval token.** Without one → `403 TOKEN_MISSING`.

### Approval Token Flow

```
1. Agent/UI drafts an action (Phase 1 endpoints)
2. User reviews the draft
3. POST /api/tools/request_approval { scope, payload }  →  { tokenId, expiresAt }
4. POST /api/tools/<mutation>       { ..., approvalToken: tokenId }
5. Token is consumed (single-use), action is executed and logged
```

**Token properties:**
- Scoped to a specific action type (`archive_bulk`, `create_filter`, etc.)
- Payload hash verification — token only works for the exact payload it was created for
- Expires after 10 minutes
- Single-use — consumed atomically on first valid use
- Tied to session ID

**Safety guarantees:**
- No mutation executes without an explicit approval token
- Tokens cannot be reused, replayed, or applied to different payloads
- All Phase 2 attempts are audit-logged (approved/denied/success/failure)
- Invalid/missing token always returns 403 with a clear error code

### Audit Log

All Phase 2 mutation attempts are persisted to the `action_log` table with:
- Session ID, action type, status (approved/denied/success/failure)
- Target summary (JSON), token ID, error details
- Timestamp

### Database Tables (Auto-Created)

| Table | Purpose |
|---|---|
| `approval_token` | Approval tokens with scope, payload hash, expiry, consumed state |
| `action_log` | Audit log of all Phase 2 mutation attempts |
| `suggestion_feedback` | User thumbs up/down on triage suggestions |

All tables are created idempotently at startup via `initDb()`.

### Local Dev Testing (curl examples)

```bash
# Phase 1: List inbox (mock data in LOCAL_DEV_NO_AUTH mode)
curl -s -X POST http://localhost:3001/api/tools/list_inbox | jq .

# Phase 1: Get a specific message
curl -s -X POST http://localhost:3001/api/tools/get_message \
  -H 'Content-Type: application/json' \
  -d '{"messageId":"mock-001"}' | jq .

# Phase 1: Search messages
curl -s -X POST http://localhost:3001/api/tools/search_messages \
  -H 'Content-Type: application/json' \
  -d '{"query":"github"}' | jq .

# Phase 1: Draft a filter rule
curl -s -X POST http://localhost:3001/api/tools/draft_filter_rule \
  -H 'Content-Type: application/json' \
  -d '{"from":"notifications@github.com","label":"GitHub","archive":true}' | jq .

# Phase 1: Draft a bulk action plan
curl -s -X POST http://localhost:3001/api/tools/draft_bulk_action_plan \
  -H 'Content-Type: application/json' \
  -d '{"action":"archive","messageIds":["mock-001","mock-002"],"rationale":"newsletters"}' | jq .

# Phase 2: Request approval token + execute (use cookies for session)
# Step 1: Get token
TOKEN_ID=$(curl -s -X POST http://localhost:3001/api/tools/request_approval \
  -H 'Content-Type: application/json' \
  -b cookies.txt -c cookies.txt \
  -d '{"scope":"archive_bulk","payload":{"action":"archive","messageIds":["mock-001","mock-002"]}}' \
  | jq -r .tokenId)

# Step 2: Execute with token
curl -s -X POST http://localhost:3001/api/tools/apply_archive_bulk \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d "{\"messageIds\":[\"mock-001\",\"mock-002\"],\"approvalToken\":\"$TOKEN_ID\"}" | jq .
```

### UI Integration

The triage suggestion detail modal includes an **⚡ Execute** button for `archive_bulk` and `create_filter` suggestions. Clicking it opens a confirmation modal that:

1. Shows the action details and affected messages
2. Displays a warning about Gmail modification
3. Requires explicit "Confirm & Execute" click
4. Automatically requests an approval token and executes the action
5. Shows success/error feedback

---

## Suggestion Chat & Revision (v1)

Users can discuss individual suggestions with an AI agent directly on the suggestion detail page. Conversations are persisted in the database and used to generate revised suggestions.

### Data Model

| Table | Purpose |
|---|---|
| `suggestion_conversation` | One row per (run_id, suggestion_index, session_id). Links chat threads to specific suggestions. |
| `suggestion_message` | Individual chat messages (role: user/assistant/system). Ordered by created_at. |
| `suggestion_revision` | Revised suggestion JSON produced after each chat exchange. Tracks revision_index and source (llm/manual). |

All tables are created idempotently at startup in `db.ts`.

### API Endpoints

**`GET /api/suggestions/:runId/:index/chat`**
Returns the conversation, messages, latest revision, and original suggestion. Returns `null` conversation if no chat exists yet.

**`POST /api/suggestions/:runId/:index/chat`**
Body: `{ "message": "user text" }`
Appends the user message, generates an assistant response, computes a revised suggestion, persists everything, and returns the full state.

### Revision Behavior

- The revision engine receives the original suggestion + full chat transcript and outputs a revised suggestion.
- The `kind` field can change (e.g., `archive_bulk` → `mark_read`) if the user expresses preference.
- `mark_read` is a new suggestion kind added in v1: marks messages as read without archiving. Backward-compatible — older UI code that doesn't recognize it will treat the suggestion as informational.
- Revisions are append-only; each chat exchange produces a new revision with incrementing `revision_index`.
- Source is `'llm'` for agent-generated revisions (future: `'manual'` for user overrides).

### UI

The suggestion detail page includes a chat panel below the suggestion details:
- Message list with user/assistant bubbles
- Text input with Enter-to-send
- Revised suggestion banner showing updated title, rationale, and action change indicator
- Loading and error states handled

### When to Add RAG (Future)

v1 uses direct transcript context — the full chat history is sent to the LLM on each turn. This works well for short conversations (< ~20 messages). Consider adding RAG when:

- **Cross-thread retrieval**: user references decisions from other suggestion conversations
- **Large history summarization**: single conversation exceeds ~8k tokens of transcript
- **Pattern learning**: the system should learn user preferences across sessions (e.g., "always mark newsletter X as read")
- **Multi-session memory**: conversations span multiple login sessions

Implementation path: embed messages with a vector model, store in pgvector, retrieve relevant context instead of full transcript.

---

## Notes

- Uses `gmail.readonly`, `gmail.modify`, and `gmail.settings.basic` scopes — read-only by default, mutations only through approval tokens
- Flow CSS handles all styling via theme tokens and `css()` calls — no class names or external CSS framework
- OAuth tokens stored in database-backed sessions (no local `token.json`); each browser session is independent
- In production, the Express server serves the Vite-built frontend as static files
- Secret values are never logged; only key names appear in startup logs
