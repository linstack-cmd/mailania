/**
 * Mailania chat API routes.
 *
 * General inbox chat:
 *   GET  /api/chat/general
 *   POST /api/chat/general
 */

import { Router } from "express";
import { getPool } from "./db.js";
import { getConfig } from "./config.js";
import { loadGmailClient, getUserId } from "./auth.js";
import type { TriageSuggestion } from "./agent-tools.js";
import {
  generateGeneralChatResponse,
  type ChatMessage,
  type SuggestionsContext,
} from "./revision-engine.js";

function getRequestUserId(req: any, config: ReturnType<typeof getConfig>): string | null {
  return config.localDevNoAuth ? req.session.userId : getUserId(req);
}

async function loadSuggestionsContext(userId: string): Promise<SuggestionsContext | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "id", "suggestion_json", "status", "created_at"
     FROM "suggestion"
     WHERE "user_id" = $1 AND "status" = 'pending'
     ORDER BY "created_at" DESC
     LIMIT 20`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    suggestions: result.rows.map((row) => {
      const suggestion = row.suggestion_json as TriageSuggestion;
      return {
        id: row.id,
        kind: suggestion.kind,
        title: suggestion.title,
        confidence: suggestion.confidence,
        status: row.status,
        createdAt: row.created_at,
      };
    }),
  };
}

async function loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "role", "content"
     FROM "suggestion_message"
     WHERE "conversation_id" = $1
     ORDER BY "created_at" ASC`,
    [conversationId],
  );

  return result.rows.map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

async function loadConversationMessageRows(conversationId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "id", "role", "content", "created_at"
     FROM "suggestion_message"
     WHERE "conversation_id" = $1
     ORDER BY "created_at" ASC`,
    [conversationId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));
}

async function persistToolTraces(conversationId: string, traces: Array<{
  toolName: string;
  args: Record<string, unknown>;
  resultSummary: string;
  durationMs: number;
}>) {
  if (traces.length === 0) return;
  const pool = getPool();

  for (const trace of traces) {
    await pool.query(
      `INSERT INTO "chat_tool_trace"
         ("conversation_id", "tool_name", "args", "result_summary", "duration_ms")
       VALUES ($1, $2, $3, $4, $5)`,
      [conversationId, trace.toolName, JSON.stringify(trace.args), trace.resultSummary, trace.durationMs],
    );
  }
}

export function createChatRouter(): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /api/chat/general
  // -----------------------------------------------------------------------
  router.get("/chat/general", async (req, res) => {
    try {
      const config = getConfig();
      const userId = getRequestUserId(req, config);
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const pool = getPool();
      const suggestionsContext = await loadSuggestionsContext(userId);
      const convResult = await pool.query(
        `SELECT "id", "created_at", "updated_at"
         FROM "suggestion_conversation"
         WHERE "scope" = 'general' AND "user_id" = $1
         LIMIT 1`,
        [userId],
      );

      if (convResult.rows.length === 0) {
        res.json({
          conversation: null,
          messages: [],
          suggestionsContext,
        });
        return;
      }

      const conv = convResult.rows[0];
      const messages = await loadConversationMessageRows(conv.id as string);

      res.json({
        conversation: {
          id: conv.id,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
        },
        messages,
        suggestionsContext,
      });
    } catch (err) {
      console.error("General chat GET error:", err);
      res.status(500).json({ error: "Failed to load inbox chat" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/chat/general
  // -----------------------------------------------------------------------
  router.post("/chat/general", async (req, res) => {
    try {
      const { message } = req.body;
      const config = getConfig();
      const userId = getRequestUserId(req, config);
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      if (!config.anthropicApiKey) {
        res.status(503).json({ error: "LLM not configured" });
        return;
      }

      const pool = getPool();
      const suggestionsContext = await loadSuggestionsContext(userId);

      let conversationId: string;
      const existing = await pool.query(
        `SELECT "id" FROM "suggestion_conversation"
         WHERE "scope" = 'general' AND "user_id" = $1
         LIMIT 1`,
        [userId],
      );

      if (existing.rows.length > 0) {
        conversationId = existing.rows[0].id as string;
      } else {
        const created = await pool.query(
          `INSERT INTO "suggestion_conversation" ("scope", "run_id", "suggestion_index", "user_id")
           VALUES ('general', NULL, NULL, $1)
           RETURNING "id"`,
          [userId],
        );
        conversationId = created.rows[0].id as string;
      }

      const chatHistory = await loadConversationMessages(conversationId);

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'user', $2)`,
        [conversationId, message.trim()],
      );

      const auth = config.localDevNoAuth ? null : await loadGmailClient(req);
      const chatResult = await generateGeneralChatResponse(
        chatHistory,
        message.trim(),
        config.anthropicApiKey,
        config.anthropicModel,
        {
          userId,
          auth,
          localDev: config.localDevNoAuth,
        },
        suggestionsContext,
      );

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'assistant', $2)`,
        [conversationId, chatResult.assistantText],
      );

      await persistToolTraces(conversationId, chatResult.toolTraces);

      const messages = await loadConversationMessageRows(conversationId);

      res.json({
        assistantMessage: chatResult.assistantText,
        messages,
        suggestionsContext,
        suggestionsChanged: chatResult.suggestionUpdatedByTool,
        toolsUsed: chatResult.toolTraces.map((trace) => ({
          tool: trace.toolName,
          summary: trace.resultSummary,
          durationMs: trace.durationMs,
        })),
      });
    } catch (err: any) {
      console.error("General chat POST error:", err);

      if (err?.status) {
        res.status(502).json({ error: "LLM request failed", detail: err.message });
        return;
      }

      if (err instanceof SyntaxError) {
        res.status(502).json({ error: "LLM returned invalid response" });
        return;
      }

      res.status(500).json({ error: "Failed to process inbox chat message" });
    }
  });



  return router;
}
