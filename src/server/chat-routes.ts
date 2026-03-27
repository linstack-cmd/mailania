/**
 * Chat API routes for suggestion conversations (v2: user-centric).
 *
 * GET  /api/suggestions/:runId/:index/chat  — load conversation + messages + latest revision
 * POST /api/suggestions/:runId/:index/chat  — send user message, get agent response + revision
 */

import { Router } from "express";
import { getPool } from "./db.js";
import { getConfig } from "./config.js";
import { loadGmailClient, getUserId } from "./auth.js";
import type { TriageSuggestion } from "./triage.js";
import {
  getLatestSuggestionRevision,
  saveSuggestionRevision,
} from "./agent-tools.js";
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
      const config = getConfig();
      const userId = config.localDevNoAuth ? req.session.userId : getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      const pool = getPool();

      // Verify the triage run exists and belongs to this user
      const runResult = await pool.query(
        `SELECT "id", "suggestions" FROM "triage_run"
         WHERE "id" = $1 AND "user_id" = $2`,
        [runId, userId],
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
         WHERE "run_id" = $1 AND "suggestion_index" = $2 AND "user_id" = $3`,
        [runId, suggestionIndex, userId],
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

      const msgResult = await pool.query(
        `SELECT "id", "role", "content", "created_at"
         FROM "suggestion_message"
         WHERE "conversation_id" = $1
         ORDER BY "created_at" ASC`,
        [conv.id],
      );

      const revResult = await pool.query(
        `SELECT "id", "revision_index", "suggestion_json", "source", "created_at"
         FROM "suggestion_revision"
         WHERE "conversation_id" = $1
         ORDER BY "created_at" DESC, "id" DESC
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
      const { message } = req.body;
      const config = getConfig();
      const userId = config.localDevNoAuth ? req.session.userId : getUserId(req);
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const pool = getPool();

      if (!config.anthropicApiKey) {
        res.status(503).json({ error: "LLM not configured" });
        return;
      }

      // Verify run
      const runResult = await pool.query(
        `SELECT "id", "suggestions" FROM "triage_run"
         WHERE "id" = $1 AND "user_id" = $2`,
        [runId, userId],
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
         WHERE "run_id" = $1 AND "suggestion_index" = $2 AND "user_id" = $3`,
        [runId, suggestionIndex, userId],
      );

      if (existingConv.rows.length > 0) {
        convId = existingConv.rows[0].id;
      } else {
        const newConv = await pool.query(
          `INSERT INTO "suggestion_conversation" ("run_id", "suggestion_index", "user_id")
           VALUES ($1, $2, $3)
           RETURNING "id"`,
          [runId, suggestionIndex, userId],
        );
        convId = newConv.rows[0].id;
      }

      // Fetch existing messages
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

      // Get OAuth client for tool execution
      const auth = config.localDevNoAuth ? null : await loadGmailClient(req);

      // Generate assistant response
      const chatResult = await generateChatResponse(
        originalSuggestion,
        chatHistory,
        message.trim(),
        config.anthropicApiKey,
        config.anthropicModel,
        {
          userId,
          auth,
          localDev: config.localDevNoAuth,
          runId,
          suggestionIndex,
          conversationId: convId,
        },
      );

      const assistantResponse = chatResult.assistantText;

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'assistant', $2)`,
        [convId, assistantResponse],
      );

      // Persist tool traces
      if (chatResult.toolTraces.length > 0) {
        for (const trace of chatResult.toolTraces) {
          await pool.query(
            `INSERT INTO "chat_tool_trace"
               ("conversation_id", "tool_name", "args", "result_summary", "duration_ms")
             VALUES ($1, $2, $3, $4, $5)`,
            [convId, trace.toolName, JSON.stringify(trace.args), trace.resultSummary, trace.durationMs],
          );
        }
      }

      let latestRevision;

      if (chatResult.suggestionUpdatedByTool) {
        const savedRevision = await getLatestSuggestionRevision(
          {
            userId,
            auth,
            localDev: config.localDevNoAuth,
            runId,
            suggestionIndex,
            conversationId: convId,
          },
          runId,
          suggestionIndex,
        );

        if (!savedRevision) {
          throw new Error("set_suggestion reported success but no saved revision was found");
        }

        latestRevision = {
          revisionIndex: savedRevision.revisionIndex,
          suggestion: savedRevision.suggestion,
          source: savedRevision.source,
        };
      } else {
        // Fallback for normal chat replies: keep auto-generating a revised suggestion.
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

        const savedRevision = await saveSuggestionRevision(
          {
            userId,
            auth,
            localDev: config.localDevNoAuth,
            runId,
            suggestionIndex,
            conversationId: convId,
          },
          {
            runId,
            suggestionIndex,
            suggestion: revisedSuggestion,
            source: "llm",
          },
        );

        latestRevision = {
          revisionIndex: savedRevision.revisionIndex,
          suggestion: savedRevision.suggestion,
          source: savedRevision.source,
        };
      }

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
        latestRevision,
        originalSuggestion,
        toolsUsed: chatResult.toolTraces.map((t) => ({
          tool: t.toolName,
          summary: t.resultSummary,
          durationMs: t.durationMs,
        })),
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
