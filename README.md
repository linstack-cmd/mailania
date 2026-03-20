# 📬 Mailania

Minimal Gmail web client with AI-powered inbox triage. Built with React, Express, [Flow CSS](https://github.com/0916dhkim/flow-css), and Vite.

## Auth Architecture (v2)

Mailania uses **first-class user accounts** as the primary identity model:

- **Mailania User Accounts** — central identity (`mailania_user` table) with display name and email
- **Passkey (WebAuthn) Login** — passwordless login via FIDO2/passkeys. Register after first login, then use passkeys for fast re-authentication
- **Multiple Gmail Accounts** — each user can link multiple Gmail accounts (`gmail_account` table). Switch between them from the Account Settings page
- **Google OAuth** — used to connect Gmail accounts (tokens stored per-account in DB, not on session)
- **Session** — stores `userId` and `activeGmailAccountId` only. No raw tokens on session

### Identity Model

```
mailania_user (1)
  ├── passkey_credential (0..N) — WebAuthn credentials for passwordless login
  └── gmail_account (0..N) — linked Gmail accounts with OAuth tokens
        └── triage_run, approval_token, action_log, etc. — all keyed by user_id
```

All application data (`triage_run`, `approval_token`, `action_log`, `suggestion_*`, etc.) is keyed by `user_id`, not `session_id`.

### Login Flow

1. **New user via Google OAuth**: Click "Sign in with Google" → OAuth flow → user created from Google profile → Gmail account linked automatically
2. **Returning user via passkey**: Click "Sign in with Passkey" → WebAuthn ceremony → session established → primary Gmail account activated
3. **Add Gmail account**: From Account Settings, click "Add Gmail Account" → OAuth flow → new Gmail account linked to existing user

### Environment Variables (Auth)

| Variable | Required | Description |
|---|---|---|
| `WEBAUTHN_RP_ID` | No | WebAuthn Relying Party ID (domain). Defaults to hostname from `FRONTEND_ORIGIN` or `localhost` |
| `WEBAUTHN_ORIGIN` | No | WebAuthn expected origin. Defaults to `FRONTEND_ORIGIN` or `http://localhost:PORT` |
| `RESET_DB` | No | Set to `true` on first deploy after upgrading from v1 to drop old tables and recreate |

## Product Direction (Core)

Mailania's goal is to give users a **fast way to organize inbox** through a collaborative AI triage workflow.

### AI triage principles

- The LLM can triage and **suggest** actions, but must **not archive/delete emails autonomously**.
- Mailania should collaborate with the user to build a **personalized triage system** over time.
- The collaboration UI is the core product surface (not an afterthought).

## Architecture

```
mailania/
├── src/
│   ├── server/
│   │   ├── index.ts            # Routes & server startup
│   │   ├── config.ts           # Config loader (Secret Party + env vars)
│   │   ├── secret-party.ts     # Secret Party API client & decryption
│   │   ├── auth.ts             # User accounts, Gmail OAuth, session helpers
│   │   ├── passkey-routes.ts   # WebAuthn registration & authentication
│   │   ├── db.ts               # Database connection & table init (v2 schema)
│   │   ├── gmail.ts            # Gmail API wrapper (read + mutations)
│   │   ├── triage.ts           # AI triage suggestions (Claude, read-only)
│   │   ├── tools-routes.ts     # Tool API routes (Phase 1 + Phase 2)
│   │   ├── approval.ts         # Approval token system (user-scoped)
│   │   ├── action-log.ts       # Audit log for mutations (user-scoped)
│   │   ├── chat-routes.ts      # Suggestion conversation API
│   │   ├── revision-engine.ts  # Chat + suggestion revision engine
│   │   └── chat-tools.ts       # Read-only Gmail tools for chat agent
│   └── client/
│       ├── main.tsx            # Entry point
│       ├── App.tsx             # Main app with auth routing
│       ├── AccountSettings.tsx # Account management (Gmail accounts, passkeys)
│       ├── passkey.ts          # Client-side WebAuthn helpers
│       ├── TriageSuggestions.tsx
│       ├── SuggestionDetailPage.tsx
│       ├── styles.css          # Global styles + @flow-css directive
│       └── theme.ts            # Flow CSS theme tokens
├── index.html
├── vite.config.ts
├── Dockerfile
├── .env.example
└── package.json
```

## Quick Start (Local Dev — No Google Account)

```bash
# Start Postgres
docker run -d --name mailania-pg -p 5432:5432 \
  -e POSTGRES_USER=mailania -e POSTGRES_PASSWORD=mailania -e POSTGRES_DB=mailania \
  postgres:16

# Configure
cp .env.example .env
# Edit .env:
#   LOCAL_DEV_NO_AUTH=true
#   DATABASE_URL=postgresql://mailania:mailania@localhost:5432/mailania

# Run
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — mock inbox, no sign-in required. A dev user is auto-created.

## Production Setup

### 1. Google Cloud OAuth

1. Enable Gmail API in Google Cloud Console
2. Create OAuth client (Web application)
3. Authorized redirect URI: `https://your-domain.com/auth/callback`
4. Copy Client ID + Secret

### 2. Configure

Required in Secret Party (or env vars):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL` — Postgres/CockroachDB connection string
- `SESSION_SECRET` — random hex string
- `ANTHROPIC_API_KEY` — for AI triage

Optional:
- `FRONTEND_ORIGIN` — e.g. `https://mailania.example.com`
- `WEBAUTHN_RP_ID` — domain for passkey scoping (auto-detected from FRONTEND_ORIGIN)
- `WEBAUTHN_ORIGIN` — expected origin for WebAuthn (auto-detected)

### 3. Database Migration from v1

If upgrading from the old session_id-based schema:

```bash
RESET_DB=true npm start   # One-time: drops and recreates all tables
```

Then remove `RESET_DB` and restart normally. **This destroys all existing data** (Danny approved this for the redesign).

### 4. Run

```bash
npm run build
npm start
```

## API Reference

### Auth Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Auth status + user info + gmail accounts + passkey status |
| `/auth/login` | GET | Start Google OAuth flow (login or add Gmail account) |
| `/auth/callback` | GET | OAuth callback |
| `/auth/logout` | GET | Destroy session |
| `/auth/passkey/register-options` | POST | Start passkey registration (must be logged in) |
| `/auth/passkey/register-verify` | POST | Complete passkey registration |
| `/auth/passkey/login-options` | POST | Start passkey login |
| `/auth/passkey/login-verify` | POST | Complete passkey login |

### Account Management

| Endpoint | Method | Description |
|---|---|---|
| `/api/account/gmail-accounts` | GET | List linked Gmail accounts |
| `/api/account/switch-gmail` | POST | Switch active Gmail account |
| `/api/account/unlink-gmail` | POST | Remove a linked Gmail account |

### Tool API

Phase 1 (read-only) and Phase 2 (mutation with approval tokens) — see inline docs in `tools-routes.ts`.

### Suggestion Chat

`GET/POST /api/suggestions/:runId/:index/chat` — see `chat-routes.ts`.

## Database Schema (v2)

| Table | Purpose |
|---|---|
| `session` | Express sessions (connect-pg-simple) |
| `mailania_user` | First-class user accounts |
| `passkey_credential` | WebAuthn credentials |
| `gmail_account` | Linked Gmail accounts with OAuth tokens |
| `triage_run` | AI triage suggestion runs (keyed by user_id) |
| `approval_token` | Approval tokens for mutations (keyed by user_id) |
| `action_log` | Audit log (keyed by user_id) |
| `suggestion_feedback` | User feedback on suggestions |
| `suggestion_conversation` | Chat threads per suggestion |
| `suggestion_message` | Chat messages |
| `suggestion_revision` | Revised suggestions from chat |
| `chat_tool_trace` | Tool execution audit trail |

All tables created idempotently at startup. Use `RESET_DB=true` for clean slate.

## Dependencies Added (v2)

- `@simplewebauthn/server` — server-side WebAuthn verification
- `@simplewebauthn/browser` — client-side WebAuthn ceremony
- `@simplewebauthn/types` — shared TypeScript types

## Notes

- OAuth scopes: `gmail.readonly`, `gmail.modify`, `gmail.settings.basic`, `userinfo.email`, `userinfo.profile`
- Tokens are stored in DB per Gmail account, not on session — enables multi-account and proper refresh
- Token refresh is handled automatically via `google-auth-library` event listener
- Passkeys use discoverable credentials (resident keys) — browser shows all available passkeys
- All application data is owned by `user_id`, enabling clean multi-device/multi-session access
