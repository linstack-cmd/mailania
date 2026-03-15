# 📬 Mailania

Minimal Gmail web client with Google OAuth and inbox listing. Built with React, Express, [Flow CSS](https://github.com/0916dhkim/flow-css), and Vite. Designed as a web app foundation with future mobile compatibility in mind.

## Architecture

- **Frontend:** React + Vite + Flow CSS (theme-driven, zero-class styling)
- **Backend:** Express API server (OAuth flow, Gmail API proxy)
- **Secrets:** Optional [Secret Party](https://github.com/0916dhkim/secret-party) integration for encrypted secret management
- **Deploy:** Dockerfile included, Dokploy-ready

```
mailania/
├── src/
│   ├── server/
│   │   ├── index.ts          # Routes & server startup
│   │   ├── config.ts         # Config loader (Secret Party + env fallback)
│   │   ├── secret-party.ts   # Secret Party API client & decryption
│   │   ├── auth.ts           # OAuth2 token management
│   │   └── gmail.ts          # Gmail API wrapper
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

Fill in your credentials:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/callback
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
INBOX_LIMIT=25
```

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
5. Add environment variables (see below for Secret Party option)
6. Deploy
7. Verify health: `https://mailania.probablydanny.com/healthz`
8. Sign in flow should return to app home after Google auth

---

## Secret Party Integration

Mailania supports [Secret Party](https://github.com/0916dhkim/secret-party) for encrypted secret management. When configured, OAuth credentials are fetched and decrypted from Secret Party at server startup instead of being stored as plain-text env vars.

### How it works

| Approach | Tradeoffs |
|----------|-----------|
| **Runtime fetch (chosen)** | Secrets fetched once at server boot. Simple — no build-time tooling, works with any orchestrator. Adds ~1-2s to cold start. If Secret Party is unreachable, falls back to env vars. |
| Build-time fetch (alternative) | Secrets baked into the container image. Faster cold starts but requires Secret Party access during `docker build`, complicates CI, and means secrets live in the image layer. |

**Runtime fetch was chosen** because it's simpler, more secure (secrets never written to disk/image), and degrades gracefully.

### Setup

1. **Create an API client** in Secret Party for the Mailania project/environment
2. **Save the private key** (base64-encoded PKCS8) — this is the only secret you store as an env var
3. **Store your Google credentials** as secrets in Secret Party:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `FRONTEND_ORIGIN` (optional)
4. **Set three env vars** in Dokploy (or `.env`):

```env
SECRET_PARTY_API_URL=https://secret-party.probablydanny.com
SECRET_PARTY_ENVIRONMENT_ID=1158452150597681153
SECRET_PARTY_PRIVATE_KEY_BASE64=<your-api-client-private-key-base64>
```

### Priority & fallback

Secret Party values take priority when available. If a key isn't found in Secret Party (or Secret Party is unreachable), the corresponding `GOOGLE_*` / `FRONTEND_ORIGIN` env var is used as fallback.

This means you can:
- **Use Secret Party only** — set the three `SECRET_PARTY_*` vars; no `GOOGLE_*` vars needed.
- **Use env vars only** — omit the `SECRET_PARTY_*` vars; works exactly like before.
- **Use both** — Secret Party takes priority, env vars are the safety net.

### Crypto details

- **Auth:** Public key (SPKI, base64) derived from the private key at runtime, sent as `Authorization: Bearer <publicKey>`
- **DEK unwrap:** RSA-OAEP (2048-bit, SHA-256) decrypt of per-environment DEK
- **Secret unwrap:** AES-256-GCM decrypt of each secret value using the DEK
- **No extra dependencies** — uses Node.js built-in `crypto` module

---

## Notes

- Uses `gmail.readonly` scope — Mailania can only read, never send or modify
- Flow CSS handles all styling via theme tokens and `css()` calls — no class names or external CSS framework
- Token stored in `token.json` (gitignored); delete to re-authenticate
- In production, the Express server serves the Vite-built frontend as static files
- Secret values are never logged; only key names appear in startup logs
