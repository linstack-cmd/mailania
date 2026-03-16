/**
 * Tool API routes — /api/tools/*
 *
 * PHASE 1: Read-only endpoints (list_inbox, get_message, search_messages,
 *          draft_filter_rule, draft_bulk_action_plan, save_suggestion_feedback)
 *
 * PHASE 2: Mutation endpoints requiring approval tokens
 *          (apply_archive_bulk, create_filter, label_messages, unarchive)
 *
 * All endpoints return structured JSON suitable for tool-calling agents.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { loadToken, isAuthenticated } from "./auth.js";
import { getConfig } from "./config.js";
import {
  listInbox,
  getMessage,
  searchMessages,
  archiveMessages,
  unarchiveMessages,
  labelMessages,
  createGmailFilter,
  type FilterRule,
} from "./gmail.js";
import { MOCK_INBOX_MESSAGES } from "./mock-data.js";
import { generateTriageSuggestions } from "./triage.js";
import {
  createApprovalToken,
  validateAndConsumeToken,
  hashPayload,
  type ApprovalScope,
} from "./approval.js";
import { logAction } from "./action-log.js";
import { getPool } from "./db.js";

export function createToolsRouter(): Router {
  const router = Router();
  const config = getConfig();

  // -----------------------------------------------------------------------
  // Auth helper — returns OAuth2Client or sends 401
  // -----------------------------------------------------------------------

  function getAuth(req: Request, res: Response) {
    if (config.localDevNoAuth) return null; // Mock mode
    const auth = loadToken(req);
    if (!auth) {
      res.status(401).json({ error: "Not authenticated" });
      return undefined; // Signal: response already sent
    }
    return auth;
  }

  function requireAuth(req: Request, res: Response) {
    if (config.localDevNoAuth) return "local-dev";
    const auth = loadToken(req);
    if (!auth) {
      res.status(401).json({ error: "Not authenticated" });
      return undefined;
    }
    return auth;
  }

  // =====================================================================
  // PHASE 1 — Read-only / suggestion endpoints
  // =====================================================================

  /**
   * POST /api/tools/list_inbox
   * Returns inbox messages. Body: { maxResults?: number }
   */
  router.post("/list_inbox", async (req, res) => {
    try {
      const maxResults = req.body?.maxResults ?? config.inboxLimit;

      if (config.localDevNoAuth) {
        res.json({ messages: MOCK_INBOX_MESSAGES.slice(0, maxResults) });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const messages = await listInbox(auth, maxResults);
      res.json({ messages });
    } catch (err: any) {
      console.error("[tools/list_inbox]", err);
      res.status(500).json({ error: "Failed to list inbox", detail: err.message });
    }
  });

  /**
   * POST /api/tools/get_message
   * Returns a single message by ID. Body: { messageId: string }
   */
  router.post("/get_message", async (req, res) => {
    try {
      const { messageId } = req.body ?? {};
      if (!messageId || typeof messageId !== "string") {
        res.status(400).json({ error: "messageId is required (string)" });
        return;
      }

      if (config.localDevNoAuth) {
        const mock = MOCK_INBOX_MESSAGES.find((m) => m.id === messageId);
        if (!mock) { res.status(404).json({ error: "Message not found" }); return; }
        res.json({ message: mock });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const message = await getMessage(auth, messageId);
      res.json({ message });
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.status === 404) {
        res.status(404).json({ error: "Message not found" });
        return;
      }
      console.error("[tools/get_message]", err);
      res.status(500).json({ error: "Failed to get message", detail: err.message });
    }
  });

  /**
   * POST /api/tools/search_messages
   * Search messages with Gmail query syntax. Body: { query: string, maxResults?: number }
   */
  router.post("/search_messages", async (req, res) => {
    try {
      const { query, maxResults } = req.body ?? {};
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "query is required (string)" });
        return;
      }

      if (config.localDevNoAuth) {
        // Basic mock search: filter by subject/from/snippet containing the query
        const q = query.toLowerCase();
        const results = MOCK_INBOX_MESSAGES.filter(
          (m) =>
            m.subject.toLowerCase().includes(q) ||
            m.from.toLowerCase().includes(q) ||
            m.snippet.toLowerCase().includes(q),
        );
        res.json({ messages: results.slice(0, maxResults ?? 25) });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const messages = await searchMessages(auth, query, maxResults ?? 25);
      res.json({ messages });
    } catch (err: any) {
      console.error("[tools/search_messages]", err);
      res.status(500).json({ error: "Failed to search messages", detail: err.message });
    }
  });

  /**
   * POST /api/tools/draft_filter_rule
   * Returns a filter rule draft — no Gmail mutation. Body: { from?, subject?, hasTheWord?, label?, archive?, markRead? }
   */
  router.post("/draft_filter_rule", async (req, res) => {
    try {
      const { from, subject, hasTheWord, label, archive, markRead } = req.body ?? {};

      if (!from && !subject && !hasTheWord) {
        res.status(400).json({ error: "At least one criteria required: from, subject, or hasTheWord" });
        return;
      }

      const draft: FilterRule = {
        from: from || undefined,
        subject: subject || undefined,
        hasTheWord: hasTheWord || undefined,
        label: label || undefined,
        archive: archive ?? false,
        markRead: markRead ?? false,
      };

      res.json({
        draft,
        payloadHash: hashPayload(draft),
        note: "This is a draft only. Use POST /api/tools/create_filter with an approval token to apply.",
      });
    } catch (err: any) {
      console.error("[tools/draft_filter_rule]", err);
      res.status(500).json({ error: "Failed to draft filter rule", detail: err.message });
    }
  });

  /**
   * POST /api/tools/draft_bulk_action_plan
   * Returns candidate messageIds + rationale for a bulk action. No mutation.
   * Body: { action: "archive"|"label"|"unarchive", messageIds: string[], rationale: string, label?: string }
   */
  router.post("/draft_bulk_action_plan", async (req, res) => {
    try {
      const { action, messageIds, rationale, label } = req.body ?? {};

      if (!action || !["archive", "label", "unarchive"].includes(action)) {
        res.status(400).json({ error: "action must be one of: archive, label, unarchive" });
        return;
      }
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        res.status(400).json({ error: "messageIds must be a non-empty array" });
        return;
      }
      if (!rationale || typeof rationale !== "string") {
        res.status(400).json({ error: "rationale is required (string)" });
        return;
      }
      if (action === "label" && (!label || typeof label !== "string")) {
        res.status(400).json({ error: "label is required for label action" });
        return;
      }

      const plan = { action, messageIds, rationale, ...(label ? { label } : {}) };

      // Map to approval scope
      const scopeMap: Record<string, ApprovalScope> = {
        archive: "archive_bulk",
        label: "label_messages",
        unarchive: "unarchive",
      };

      res.json({
        plan,
        approvalScope: scopeMap[action],
        payloadHash: hashPayload(plan),
        note: "This is a plan only. Request an approval token and call the corresponding execute endpoint.",
      });
    } catch (err: any) {
      console.error("[tools/draft_bulk_action_plan]", err);
      res.status(500).json({ error: "Failed to draft action plan", detail: err.message });
    }
  });

  /**
   * POST /api/tools/save_suggestion_feedback
   * Persist user feedback on a triage suggestion.
   * Body: { runId?: string, suggestionIndex: number, vote: "up"|"down", note?: string }
   */
  router.post("/save_suggestion_feedback", async (req, res) => {
    try {
      const { runId, suggestionIndex, vote, note } = req.body ?? {};

      if (typeof suggestionIndex !== "number" || suggestionIndex < 0) {
        res.status(400).json({ error: "suggestionIndex is required (non-negative integer)" });
        return;
      }
      if (!vote || !["up", "down"].includes(vote)) {
        res.status(400).json({ error: 'vote must be "up" or "down"' });
        return;
      }

      const sessionId = req.sessionID;

      const result = await getPool().query(
        `INSERT INTO "suggestion_feedback" ("session_id", "run_id", "suggestion_index", "vote", "note")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "id", "created_at"`,
        [sessionId, runId ?? null, suggestionIndex, vote, note ?? null],
      );

      res.json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
    } catch (err: any) {
      console.error("[tools/save_suggestion_feedback]", err);
      res.status(500).json({ error: "Failed to save feedback", detail: err.message });
    }
  });

  // =====================================================================
  // Approval token management
  // =====================================================================

  /**
   * POST /api/tools/request_approval
   * Generate an approval token for a Phase 2 action.
   * Body: { scope: ApprovalScope, payload: object }
   */
  router.post("/request_approval", async (req, res) => {
    try {
      const { scope, payload } = req.body ?? {};

      const validScopes: ApprovalScope[] = ["archive_bulk", "create_filter", "label_messages", "unarchive"];
      if (!scope || !validScopes.includes(scope)) {
        res.status(400).json({ error: `scope must be one of: ${validScopes.join(", ")}` });
        return;
      }
      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "payload is required (object)" });
        return;
      }

      const token = await createApprovalToken(req.sessionID, scope, payload);

      res.json({
        tokenId: token.id,
        scope: token.scope,
        payloadHash: token.payload_hash,
        expiresAt: token.expires_at,
        note: "Include this tokenId when calling the corresponding Phase 2 mutation endpoint.",
      });
    } catch (err: any) {
      console.error("[tools/request_approval]", err);
      res.status(500).json({ error: "Failed to create approval token", detail: err.message });
    }
  });

  // =====================================================================
  // PHASE 2 — Mutation endpoints (require approval token)
  // =====================================================================

  /**
   * POST /api/tools/apply_archive_bulk
   * Archive messages by removing INBOX label.
   * Body: { messageIds: string[], approvalToken: string }
   */
  router.post("/apply_archive_bulk", async (req, res) => {
    const sessionId = req.sessionID;
    try {
      const { messageIds, approvalToken } = req.body ?? {};

      if (!approvalToken) {
        res.status(403).json({ error: "Approval token required for mutations", code: "TOKEN_MISSING" });
        return;
      }
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        res.status(400).json({ error: "messageIds must be a non-empty array" });
        return;
      }

      const payload = { action: "archive", messageIds };
      const validation = await validateAndConsumeToken(approvalToken, "archive_bulk", payload);

      if (!validation.valid) {
        await logAction({ sessionId, action: "archive_bulk", status: "denied", targetSummary: { messageIds }, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ sessionId, action: "archive_bulk", status: "approved", targetSummary: { messageIds }, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ sessionId, action: "archive_bulk", status: "success", targetSummary: { messageIds }, tokenId: validation.token.id });
        res.json({ archived: messageIds, errors: [], mock: true });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const result = await archiveMessages(auth, messageIds);
      const status = result.errors.length === 0 ? "success" : "failure";
      await logAction({ sessionId, action: "archive_bulk", status, targetSummary: result, tokenId: validation.token.id, error: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined });

      res.json(result);
    } catch (err: any) {
      await logAction({ sessionId, action: "archive_bulk", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/apply_archive_bulk]", err);
      res.status(500).json({ error: "Failed to archive messages", detail: err.message });
    }
  });

  /**
   * POST /api/tools/create_filter
   * Create a Gmail filter.
   * Body: { rule: FilterRule, approvalToken: string }
   */
  router.post("/create_filter", async (req, res) => {
    const sessionId = req.sessionID;
    try {
      const { rule, approvalToken } = req.body ?? {};

      if (!approvalToken) {
        res.status(403).json({ error: "Approval token required for mutations", code: "TOKEN_MISSING" });
        return;
      }
      if (!rule || typeof rule !== "object") {
        res.status(400).json({ error: "rule is required (object)" });
        return;
      }

      const validation = await validateAndConsumeToken(approvalToken, "create_filter", rule);

      if (!validation.valid) {
        await logAction({ sessionId, action: "create_filter", status: "denied", targetSummary: rule, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ sessionId, action: "create_filter", status: "approved", targetSummary: rule, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ sessionId, action: "create_filter", status: "success", targetSummary: rule, tokenId: validation.token.id });
        res.json({ filterId: "mock-filter-id", mock: true });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const result = await createGmailFilter(auth, rule);
      await logAction({ sessionId, action: "create_filter", status: "success", targetSummary: { ...rule, filterId: result.filterId }, tokenId: validation.token.id });

      res.json(result);
    } catch (err: any) {
      await logAction({ sessionId, action: "create_filter", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/create_filter]", err);
      res.status(500).json({ error: "Failed to create filter", detail: err.message });
    }
  });

  /**
   * POST /api/tools/label_messages
   * Apply a label to messages.
   * Body: { messageIds: string[], label: string, approvalToken: string }
   */
  router.post("/label_messages", async (req, res) => {
    const sessionId = req.sessionID;
    try {
      const { messageIds, label, approvalToken } = req.body ?? {};

      if (!approvalToken) {
        res.status(403).json({ error: "Approval token required for mutations", code: "TOKEN_MISSING" });
        return;
      }
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        res.status(400).json({ error: "messageIds must be a non-empty array" });
        return;
      }
      if (!label || typeof label !== "string") {
        res.status(400).json({ error: "label is required (string)" });
        return;
      }

      const payload = { action: "label", messageIds, label };
      const validation = await validateAndConsumeToken(approvalToken, "label_messages", payload);

      if (!validation.valid) {
        await logAction({ sessionId, action: "label_messages", status: "denied", targetSummary: payload, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ sessionId, action: "label_messages", status: "approved", targetSummary: payload, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ sessionId, action: "label_messages", status: "success", targetSummary: payload, tokenId: validation.token.id });
        res.json({ labeled: messageIds, labelId: "mock-label-id", errors: [], mock: true });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const result = await labelMessages(auth, messageIds, label);
      const status = result.errors.length === 0 ? "success" : "failure";
      await logAction({ sessionId, action: "label_messages", status, targetSummary: { ...payload, labelId: result.labelId }, tokenId: validation.token.id, error: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined });

      res.json(result);
    } catch (err: any) {
      await logAction({ sessionId, action: "label_messages", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/label_messages]", err);
      res.status(500).json({ error: "Failed to label messages", detail: err.message });
    }
  });

  /**
   * POST /api/tools/unarchive
   * Move messages back to inbox.
   * Body: { messageIds: string[], approvalToken: string }
   */
  router.post("/unarchive", async (req, res) => {
    const sessionId = req.sessionID;
    try {
      const { messageIds, approvalToken } = req.body ?? {};

      if (!approvalToken) {
        res.status(403).json({ error: "Approval token required for mutations", code: "TOKEN_MISSING" });
        return;
      }
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        res.status(400).json({ error: "messageIds must be a non-empty array" });
        return;
      }

      const payload = { action: "unarchive", messageIds };
      const validation = await validateAndConsumeToken(approvalToken, "unarchive", payload);

      if (!validation.valid) {
        await logAction({ sessionId, action: "unarchive", status: "denied", targetSummary: payload, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ sessionId, action: "unarchive", status: "approved", targetSummary: payload, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ sessionId, action: "unarchive", status: "success", targetSummary: payload, tokenId: validation.token.id });
        res.json({ unarchived: messageIds, errors: [], mock: true });
        return;
      }

      const auth = loadToken(req);
      if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }

      const result = await unarchiveMessages(auth, messageIds);
      const status = result.errors.length === 0 ? "success" : "failure";
      await logAction({ sessionId, action: "unarchive", status, targetSummary: result, tokenId: validation.token.id, error: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined });

      res.json(result);
    } catch (err: any) {
      await logAction({ sessionId, action: "unarchive", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/unarchive]", err);
      res.status(500).json({ error: "Failed to unarchive messages", detail: err.message });
    }
  });

  return router;
}
