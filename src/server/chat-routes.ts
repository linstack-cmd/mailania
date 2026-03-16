/**
 * Chat API routes for suggestion conversations.
 *
 * GET  /api/suggestions/:runId/:index/chat  — load conversation + messages + latest revision
 * POST /api/suggestions/:runId/:index/chat  — send user message, get agent response + revision
 */

import { Router } from "express";
import { getPool } from "./db.js";
import { getConfig } from "./config.js";
import type { TriageSuggestion } from "./triage.js";
import {
  generateChatResponse,
  generateRevision,
  type ChatMessage,
} from "./revision-engine.js";

export function createChatRouter(): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /api/suggestions/:runId/:index/chat
  // -----------------------------------------------------------------------
  router.get("/:runId/:index/chat", async (req, res) => {
    try {
      const { runId, index } = req.params;
      const suggestionIndex = parseInt(index, 10);
      const sessionId = req.sessionID;
      const pool = getPool();

      // Verify the triage run exists and belongs to this session
      const runResult = await pool.query(
        `SELECT "id", "suggestions" FROM "triage_run"
         WHERE "id" = $1 AND "session_id" = $2`,
        [runId, sessionId],
      );

      if (runResult.rows.length === 0) {
        res.status(404).json({ error: "Triage run not found" });
        return;
      }

      const suggestions = runResult.rows[0].suggestions as TriageSuggestion[];
      if (suggestionIndex < 0 || suggestionIndex >= suggestions.length) {
        res.status(404).json({ error: "Suggestion index out of range" });
        return;
      }

      const originalSuggestion = suggestions[suggestionIndex];

      // Find or indicate no conversation yet
      const convResult = await pool.query(
        `SELECT "id", "created_at", "updated_at"
         FROM "suggestion_conversation"
         WHERE "run_id" = $1 AND "suggestion_index" = $2 AND "session_id" = $3`,
        [runId, suggestionIndex, sessionId],
      );

      if (convResult.rows.length === 0) {
        res.json({
          conversation: null,
          messages: [],
          latestRevision: null,
          originalSuggestion,
        });
        return;
      }

      const conv = convResult.rows[0];

      // Fetch messages
      const msgResult = await pool.query(
        `SELECT "id", "role", "content", "created_at"
         FROM "suggestion_message"
         WHERE "conversation_id" = $1
         ORDER BY "created_at" ASC`,
        [conv.id],
      );

      // Fetch latest revision
      const revResult = await pool.query(
        `SELECT "id", "revision_index", "suggestion_json", "source", "created_at"
         FROM "suggestion_revision"
         WHERE "conversation_id" = $1
         ORDER BY "revision_index" DESC
         LIMIT 1`,
        [conv.id],
      );

      res.json({
        conversation: {
          id: conv.id,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
        },
        messages: msgResult.rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          createdAt: r.created_at,
        })),
        latestRevision: revResult.rows.length > 0
          ? {
              id: revResult.rows[0].id,
              revisionIndex: revResult.rows[0].revision_index,
              suggestion: revResult.rows[0].suggestion_json,
              source: revResult.rows[0].source,
              createdAt: revResult.rows[0].created_at,
            }
          : null,
        originalSuggestion,
      });
    } catch (err) {
      console.error("Chat GET error:", err);
      res.status(500).json({ error: "Failed to load chat" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/suggestions/:runId/:index/chat
  // -----------------------------------------------------------------------
  router.post("/:runId/:index/chat", async (req, res) => {
    try {
      const { runId, index } = req.params;
      const suggestionIndex = parseInt(index, 10);
      const sessionId = req.sessionID;
      const { message } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const pool = getPool();
      const config = getConfig();

      if (!config.anthropicApiKey) {
        res.status(503).json({ error: "LLM not configured" });
        return;
      }

      // Verify run
      const runResult = await pool.query(
        `SELECT "id", "suggestions" FROM "triage_run"
         WHERE "id" = $1 AND "session_id" = $2`,
        [runId, sessionId],
      );

      if (runResult.rows.length === 0) {
        res.status(404).json({ error: "Triage run not found" });
        return;
      }

      const suggestions = runResult.rows[0].suggestions as TriageSuggestion[];
      if (suggestionIndex < 0 || suggestionIndex >= suggestions.length) {
        res.status(404).json({ error: "Suggestion index out of range" });
        return;
      }

      const originalSuggestion = suggestions[suggestionIndex];

      // Get or create conversation
      let convId: string;
      const existingConv = await pool.query(
        `SELECT "id" FROM "suggestion_conversation"
         WHERE "run_id" = $1 AND "suggestion_index" = $2 AND "session_id" = $3`,
        [runId, suggestionIndex, sessionId],
      );

      if (existingConv.rows.length > 0) {
        convId = existingConv.rows[0].id;
      } else {
        const newConv = await pool.query(
          `INSERT INTO "suggestion_conversation" ("run_id", "suggestion_index", "session_id")
           VALUES ($1, $2, $3)
           RETURNING "id"`,
          [runId, suggestionIndex, sessionId],
        );
        convId = newConv.rows[0].id;
      }

      // Fetch existing messages for context
      const existingMsgs = await pool.query(
        `SELECT "role", "content" FROM "suggestion_message"
         WHERE "conversation_id" = $1
         ORDER BY "created_at" ASC`,
        [convId],
      );

      const chatHistory: ChatMessage[] = existingMsgs.rows.map((r) => ({
        role: r.role,
        content: r.content,
      }));

      // Store user message
      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'user', $2)`,
        [convId, message.trim()],
      );

      // Generate assistant response
      const assistantResponse = await generateChatResponse(
        originalSuggestion,
        chatHistory,
        message.trim(),
        config.anthropicApiKey,
        config.anthropicModel,
      );

      // Store assistant message
      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'assistant', $2)`,
        [convId, assistantResponse],
      );

      // Generate revised suggestion
      const fullHistory: ChatMessage[] = [
        ...chatHistory,
        { role: "user", content: message.trim() },
        { role: "assistant", content: assistantResponse },
      ];

      const revisedSuggestion = await generateRevision(
        originalSuggestion,
        fullHistory,
        config.anthropicApiKey,
        config.anthropicModel,
      );

      // Get current revision count
      const revCountResult = await pool.query(
        `SELECT COALESCE(MAX("revision_index"), -1) as max_idx
         FROM "suggestion_revision"
         WHERE "conversation_id" = $1`,
        [convId],
      );
      const nextRevisionIndex = (revCountResult.rows[0].max_idx as number) + 1;

      // Store revision
      await pool.query(
        `INSERT INTO "suggestion_revision" ("conversation_id", "revision_index", "suggestion_json", "source")
         VALUES ($1, $2, $3, 'llm')`,
        [convId, nextRevisionIndex, JSON.stringify(revisedSuggestion)],
      );

      // Update conversation timestamp
      await pool.query(
        `UPDATE "suggestion_conversation" SET "updated_at" = now() WHERE "id" = $1`,
        [convId],
      );

      // Fetch all messages for response
      const allMsgs = await pool.query(
        `SELECT "id", "role", "content", "created_at"
         FROM "suggestion_message"
         WHERE "conversation_id" = $1
         ORDER BY "created_at" ASC`,
        [convId],
      );

      res.json({
        assistantMessage: assistantResponse,
        messages: allMsgs.rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          createdAt: r.created_at,
        })),
        latestRevision: {
          revisionIndex: nextRevisionIndex,
          suggestion: revisedSuggestion,
          source: "llm",
        },
        originalSuggestion,
      });
    } catch (err: any) {
      console.error("Chat POST error:", err);

      if (err?.status) {
        res.status(502).json({ error: "LLM request failed", detail: err.message });
        return;
      }

      if (err instanceof SyntaxError) {
        res.status(502).json({ error: "LLM returned invalid response" });
        return;
      }

      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  return router;
}
