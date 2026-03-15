# 📬 Mailania

Minimal Gmail web client with Google OAuth and inbox listing. Built with React, Express, [Flow CSS](https://github.com/0916dhkim/flow-css), and Vite. Designed as a web app foundation with future mobile compatibility in mind.

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
│   │   ├── config.ts         # Config loader (Secret Party only for OAuth config)
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
- `GOOGLE_REDIRECT_URI` (optional — if omitted, inferred per-request from reverse proxy headers)
- `FRONTEND_ORIGIN` (optional)

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
   - `GOOGLE_REDIRECT_URI` (optional — see below)
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
- Optional keys in Secret Party: `GOOGLE_REDIRECT_URI`, `FRONTEND_ORIGIN`
- Plaintext `GOOGLE_*` env vars are intentionally ignored

### Redirect URI inference

If `GOOGLE_REDIRECT_URI` is **not** set in Secret Party, Mailania infers it per-request from reverse proxy headers:

```
{x-forwarded-proto || req.protocol}://{x-forwarded-host || Host}/auth/callback
```

This works automatically behind Traefik / Dokploy without extra config. If you need a fixed redirect URI (e.g. for strict Google Cloud redirect validation), set `GOOGLE_REDIRECT_URI` in Secret Party and it will be used as-is.

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
