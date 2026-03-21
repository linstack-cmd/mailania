-- Clear all suggestion-related data from Mailania DB for fresh testing.
-- Run via: psql $DATABASE_URL -f scripts/clear-suggestions.sql
-- Or via CockroachDB SQL shell.
--
-- This preserves user accounts, Gmail accounts, passkeys, and sessions.
-- It only removes triage/suggestion data.

BEGIN;

-- Chat tool traces (FK → suggestion_conversation)
DELETE FROM "chat_tool_trace";

-- Suggestion revisions (FK → suggestion_conversation)
DELETE FROM "suggestion_revision";

-- Suggestion messages (FK → suggestion_conversation)
DELETE FROM "suggestion_message";

-- Suggestion conversations
DELETE FROM "suggestion_conversation";

-- Suggestion feedback
DELETE FROM "suggestion_feedback";

-- Approval tokens (tied to triage actions)
DELETE FROM "approval_token";

-- Action log (audit trail of executed actions)
DELETE FROM "action_log";

-- Triage runs (the core suggestion data)
DELETE FROM "triage_run";

COMMIT;

-- Verify
SELECT 'triage_run' AS "table", COUNT(*) AS "rows" FROM "triage_run"
UNION ALL SELECT 'suggestion_conversation', COUNT(*) FROM "suggestion_conversation"
UNION ALL SELECT 'suggestion_message', COUNT(*) FROM "suggestion_message"
UNION ALL SELECT 'suggestion_revision', COUNT(*) FROM "suggestion_revision"
UNION ALL SELECT 'suggestion_feedback', COUNT(*) FROM "suggestion_feedback"
UNION ALL SELECT 'chat_tool_trace', COUNT(*) FROM "chat_tool_trace"
UNION ALL SELECT 'approval_token', COUNT(*) FROM "approval_token"
UNION ALL SELECT 'action_log', COUNT(*) FROM "action_log";
