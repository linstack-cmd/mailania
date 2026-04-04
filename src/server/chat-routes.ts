/**
 * Mailania chat API routes.
 *
 * General inbox chat:
 *   GET  /api/chat/general
 *   POST /api/chat/general
 *
 * Suggestion-scoped chat:
 *   GET  /api/suggestions/:runId/:index/chat
 *   POST /api/suggestions/:runId/:index/chat
 */

import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getPool } from "./db.js";
import { getConfig } from "./config.js";
import { loadGmailClient, getUserId } from "./auth.js";
import type { TriageSuggestion } from "./triage.js";
import {
  getLatestSuggestionRevision,
  saveSuggestionRevision,
} from "./agent-tools.js";
import {
  buildGeneralChatPrompt,
  buildRevisionPrompt,
  buildSuggestionChatPrompt,
  generateChatResponse,
  generateGeneralChatResponse,
  generateRevision,
  type ChatMessage,
  type LatestTriageContext,
} from "./revision-engine.js";
import {
  getActivePromptHistory,
  isCompactionSummaryMessage,
  maybeCompactConversation,
  type StoredChatMessage,
} from "./chat-compaction.js";

function getRequestUserId(req: any, config: ReturnType<typeof getConfig>): string | null {
  return config.localDevNoAuth ? req.session.userId : getUserId(req);
}

async function loadLatestTriageContext(userId: string): Promise<LatestTriageContext | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "id", "created_at", "suggestions"
     FROM "triage_run"
     WHERE "user_id" = $1
     ORDER BY "created_at" DESC
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) return null;

  const run = result.rows[0];
  const suggestions = (run.suggestions as TriageSuggestion[]) ?? [];

  return {
    runId: run.id as string,
    createdAt: run.created_at as Date,
    suggestionCount: suggestions.length,
    suggestions: suggestions.map((suggestion, suggestionIndex) => ({
      suggestionIndex,
      kind: suggestion.kind,
      title: suggestion.title,
      confidence: suggestion.confidence,
      messageCount: suggestion.messageIds?.length ?? 0,
    })),
  };
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

function stripStoredMessages(messages: StoredChatMessage[]): ChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

function visibleChatMessages(messages: StoredChatMessage[]): StoredChatMessage[] {
  return messages.filter((message) => !isCompactionSummaryMessage(message));
}

async function countSuggestionChatTokens(
  original: TriageSuggestion,
  history: ChatMessage[],
  pendingMessages: ChatMessage[],
  apiKey: string,
  model: string,
): Promise<number> {
  const client = new Anthropic({ apiKey });
  const promptHistory = [...history, ...pendingMessages];
  const prompt = buildSuggestionChatPrompt(
    original,
    promptHistory.slice(0, -1),
    promptHistory[promptHistory.length - 1]?.content ?? "",
  );
  const tokenCount = await client.messages.countTokens({
    model,
    system: prompt.system,
    messages: prompt.messages,
    tools: prompt.tools,
  });
  return tokenCount.input_tokens;
}

async function countGeneralChatTokens(
  history: ChatMessage[],
  pendingMessages: ChatMessage[],
  apiKey: string,
  model: string,
  latestTriage: LatestTriageContext | null,
): Promise<number> {
  const client = new Anthropic({ apiKey });
  const promptHistory = [...history, ...pendingMessages];
  const prompt = buildGeneralChatPrompt(
    promptHistory.slice(0, -1),
    promptHistory[promptHistory.length - 1]?.content ?? "",
    latestTriage,
  );
  const tokenCount = await client.messages.countTokens({
    model,
    system: prompt.system,
    messages: prompt.messages,
    tools: prompt.tools,
  });
  return tokenCount.input_tokens;
}

async function countRevisionTokens(
  original: TriageSuggestion,
  history: ChatMessage[],
  apiKey: string,
  model: string,
): Promise<number> {
  const client = new Anthropic({ apiKey });
  const prompt = buildRevisionPrompt(original, history);
  const tokenCount = await client.messages.countTokens({
    model,
    system: prompt.system,
    messages: prompt.messages,
  });
  return tokenCount.input_tokens;
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
      const latestTriage = await loadLatestTriageContext(userId);
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
          latestTriage,
        });
        return;
      }

      const conv = convResult.rows[0];
      const messages = visibleChatMessages(
        await loadConversationMessageRows(conv.id as string),
      );

      res.json({
        conversation: {
          id: conv.id,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
        },
        messages,
        latestTriage,
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
      const latestTriage = await loadLatestTriageContext(userId);

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

      let chatHistory = await loadConversationMessageRows(conversationId);

      chatHistory = await maybeCompactConversation({
        pool,
        conversationId,
        history: chatHistory,
        pendingMessages: [{ role: "user", content: message.trim() }],
        apiKey: config.anthropicApiKey,
        model: config.anthropicModel,
        summaryContext: latestTriage
          ? `GENERAL INBOX CHAT\n\nLATEST TRIAGE CONTEXT:\n${JSON.stringify(latestTriage, null, 2)}`
          : "GENERAL INBOX CHAT",
        estimatePromptTokens: (history, pendingMessages) =>
          countGeneralChatTokens(
            history,
            pendingMessages,
            config.anthropicApiKey!,
            config.anthropicModel,
            latestTriage,
          ),
      });

      chatHistory = getActivePromptHistory(chatHistory);

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'user', $2)`,
        [conversationId, message.trim()],
      );

      const auth = config.localDevNoAuth ? null : await loadGmailClient(req);
      const chatResult = await generateGeneralChatResponse(
        stripStoredMessages(chatHistory),
        message.trim(),
        config.anthropicApiKey,
        config.anthropicModel,
        {
          userId,
          auth,
          localDev: config.localDevNoAuth,
          conversationId,
        },
        latestTriage,
      );

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'assistant', $2)`,
        [conversationId, chatResult.assistantText],
      );

      await persistToolTraces(conversationId, chatResult.toolTraces);

      const messages = visibleChatMessages(
        await loadConversationMessageRows(conversationId),
      );

      res.json({
        assistantMessage: chatResult.assistantText,
        messages,
        latestTriage,
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

  // -----------------------------------------------------------------------
  // GET /api/suggestions/:runId/:index/chat
  // -----------------------------------------------------------------------
  router.get("/suggestions/:runId/:index/chat", async (req, res) => {
    try {
      const { runId, index } = req.params;
      const suggestionIndex = parseInt(index, 10);
      const config = getConfig();
      const userId = getRequestUserId(req, config);
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const pool = getPool();
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
      const convResult = await pool.query(
        `SELECT "id", "created_at", "updated_at"
         FROM "suggestion_conversation"
         WHERE "scope" = 'suggestion' AND "run_id" = $1 AND "suggestion_index" = $2 AND "user_id" = $3`,
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
      const messages = visibleChatMessages(
        await loadConversationMessageRows(conv.id as string),
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
        messages,
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
      console.error("Suggestion chat GET error:", err);
      res.status(500).json({ error: "Failed to load chat" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/suggestions/:runId/:index/chat
  // -----------------------------------------------------------------------
  router.post("/suggestions/:runId/:index/chat", async (req, res) => {
    try {
      const { runId, index } = req.params;
      const suggestionIndex = parseInt(index, 10);
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

      let conversationId: string;
      const existingConv = await pool.query(
        `SELECT "id" FROM "suggestion_conversation"
         WHERE "scope" = 'suggestion' AND "run_id" = $1 AND "suggestion_index" = $2 AND "user_id" = $3`,
        [runId, suggestionIndex, userId],
      );

      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].id as string;
      } else {
        const newConv = await pool.query(
          `INSERT INTO "suggestion_conversation" ("scope", "run_id", "suggestion_index", "user_id")
           VALUES ('suggestion', $1, $2, $3)
           RETURNING "id"`,
          [runId, suggestionIndex, userId],
        );
        conversationId = newConv.rows[0].id as string;
      }

      let chatHistory = await loadConversationMessageRows(conversationId);

      chatHistory = await maybeCompactConversation({
        pool,
        conversationId,
        history: chatHistory,
        pendingMessages: [{ role: "user", content: message.trim() }],
        apiKey: config.anthropicApiKey,
        model: config.anthropicModel,
        summaryContext: `SUGGESTION CHAT\n\nORIGINAL SUGGESTION:\n${JSON.stringify(originalSuggestion, null, 2)}`,
        estimatePromptTokens: (history, pendingMessages) =>
          countSuggestionChatTokens(
            originalSuggestion,
            history,
            pendingMessages,
            config.anthropicApiKey!,
            config.anthropicModel,
          ),
      });

      chatHistory = getActivePromptHistory(chatHistory);

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'user', $2)`,
        [conversationId, message.trim()],
      );

      const auth = config.localDevNoAuth ? null : await loadGmailClient(req);
      const chatResult = await generateChatResponse(
        originalSuggestion,
        stripStoredMessages(chatHistory),
        message.trim(),
        config.anthropicApiKey,
        config.anthropicModel,
        {
          userId,
          auth,
          localDev: config.localDevNoAuth,
          runId,
          suggestionIndex,
          conversationId,
        },
      );

      const assistantResponse = chatResult.assistantText;

      await pool.query(
        `INSERT INTO "suggestion_message" ("conversation_id", "role", "content")
         VALUES ($1, 'assistant', $2)`,
        [conversationId, assistantResponse],
      );

      await persistToolTraces(conversationId, chatResult.toolTraces);

      let latestRevision;

      if (chatResult.suggestionUpdatedByTool) {
        const savedRevision = await getLatestSuggestionRevision(
          {
            userId,
            auth,
            localDev: config.localDevNoAuth,
            runId,
            suggestionIndex,
            conversationId,
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
        const persistedMessages = await loadConversationMessageRows(conversationId);
        const fullHistory = stripStoredMessages(
          getActivePromptHistory(
            await maybeCompactConversation({
              pool,
              conversationId,
              history: persistedMessages,
              pendingMessages: [],
              apiKey: config.anthropicApiKey,
              model: config.anthropicModel,
              summaryContext: `SUGGESTION CHAT REVISION\n\nORIGINAL SUGGESTION:\n${JSON.stringify(originalSuggestion, null, 2)}`,
              estimatePromptTokens: (history) =>
                countRevisionTokens(
                  originalSuggestion,
                  history,
                  config.anthropicApiKey!,
                  config.anthropicModel,
                ),
            }),
          ),
        );

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
            conversationId,
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

      const messages = visibleChatMessages(
        await loadConversationMessageRows(conversationId),
      );

      res.json({
        assistantMessage: assistantResponse,
        messages,
        latestRevision,
        originalSuggestion,
        toolsUsed: chatResult.toolTraces.map((trace) => ({
          tool: trace.toolName,
          summary: trace.resultSummary,
          durationMs: trace.durationMs,
        })),
      });
    } catch (err: any) {
      console.error("Suggestion chat POST error:", err);

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
