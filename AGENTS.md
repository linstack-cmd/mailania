# Mailania

Email client with AI-assisted triage and suggestions.

## Stack
- Vite + TypeScript frontend
- Express backend
- CockroachDB (PostgreSQL-compatible)

## Running Locally
- Source: `/var/lib/patronum/projects/mailania`
- Start: `node dist/server/index.js`
- Port: 3001
- Set `LOCAL_DEV_NO_AUTH=true` in `.env` to bypass Google OAuth

## QA
Test at `http://localhost:3001` on mobile viewport 375x812.
Using auth bypass is recommended for automated testing.
