# 📬 Mailania

Minimal Gmail web client with Google OAuth and inbox listing. Built with React, Express, [Flow CSS](https://github.com/0916dhkim/flow-css), and Vite. Designed as a web app foundation with future mobile compatibility in mind.

## Architecture

- **Frontend:** React + Vite + Flow CSS (theme-driven, zero-class styling)
- **Backend:** Express API server (OAuth flow, Gmail API proxy)
- **Deploy:** Dockerfile included, Dokploy-ready

```
mailania/
├── src/
│   ├── server/          # Express API
│   │   ├── index.ts     # Routes & server
│   │   ├── auth.ts      # OAuth2 token management
│   │   └── gmail.ts     # Gmail API wrapper
│   └── client/          # React frontend
│       ├── main.tsx     # Entry point
│       ├── App.tsx      # UI (login + inbox)
│       ├── styles.css   # Global styles + @flow-css directive
│       └── theme.ts     # Flow CSS theme tokens
├── index.html           # Vite HTML entry
├── vite.config.ts       # Vite + Flow CSS + API proxy
├── Dockerfile           # Multi-stage production build
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
5. Add environment variables:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://mailania.probablydanny.com/auth/callback
FRONTEND_ORIGIN=https://mailania.probablydanny.com
PORT=3001
INBOX_LIMIT=25
```

6. Deploy
7. Verify health: `https://mailania.probablydanny.com/healthz`
8. Sign in flow should return to app home after Google auth

## Notes

- Uses `gmail.readonly` scope — Mailania can only read, never send or modify
- Flow CSS handles all styling via theme tokens and `css()` calls — no class names or external CSS framework
- Token stored in `token.json` (gitignored); delete to re-authenticate
- In production, the Express server serves the Vite-built frontend as static files
