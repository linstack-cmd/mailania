/**
 * Tool API routes — /api/tools/* (v2: user-centric)
 *
 * PHASE 1: Read-only endpoints
 * PHASE 2: Mutation endpoints requiring approval tokens
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { loadGmailClient, isAuthenticated, getUserId } from "./auth.js";
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

  async function getGmailAuth(req: Request, res: Response) {
    if (config.localDevNoAuth) return null; // Mock mode
    const auth = await loadGmailClient(req);
    if (!auth) {
      res.status(401).json({ error: "No Gmail account connected" });
      return undefined; // Signal: response already sent
    }
    return auth;
  }

  function requireUserId(req: Request, res: Response): string | undefined {
    if (config.localDevNoAuth) return req.session.userId || "dev-user";
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return undefined;
    }
    return userId;
  }

  // =====================================================================
  // PHASE 1 — Read-only / suggestion endpoints
  // =====================================================================

  router.post("/list_inbox", async (req, res) => {
    try {
      const maxResults = req.body?.maxResults ?? config.inboxLimit;

      if (config.localDevNoAuth) {
        res.json({ messages: MOCK_INBOX_MESSAGES.slice(0, maxResults) });
        return;
      }

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

      const messages = await listInbox(auth, maxResults);
      res.json({ messages });
    } catch (err: any) {
      console.error("[tools/list_inbox]", err);
      res.status(500).json({ error: "Failed to list inbox", detail: err.message });
    }
  });

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

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

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

  router.post("/search_messages", async (req, res) => {
    try {
      const { query, maxResults } = req.body ?? {};
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "query is required (string)" });
        return;
      }

      if (config.localDevNoAuth) {
        const q = query.toLowerCase();
        const results = MOCK_INBOX_MESSAGES.filter(
          (m) =>
            m.subject.toLowerCase().includes(q) ||
            m.from.toLowerCase().includes(q) ||
            m.snippet.toLowerCase().includes(q),
        ).slice(0, maxResults ?? 25);
        res.json({ messages: results, count: results.length, resultSizeEstimate: null });
        return;
      }

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

      const result = await searchMessages(auth, query, maxResults ?? 25);
      res.json({ messages: result.messages, count: result.count, resultSizeEstimate: result.resultSizeEstimate });
    } catch (err: any) {
      console.error("[tools/search_messages]", err);
      res.status(500).json({ error: "Failed to search messages", detail: err.message });
    }
  });

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

      const userId = requireUserId(req, res);
      if (!userId) return;

      const result = await getPool().query(
        `INSERT INTO "suggestion_feedback" ("user_id", "run_id", "suggestion_index", "vote", "note")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "id", "created_at"`,
        [userId, runId ?? null, suggestionIndex, vote, note ?? null],
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

  router.post("/request_approval", async (req, res) => {
    try {
      const { scope, payload } = req.body ?? {};
      const userId = requireUserId(req, res);
      if (!userId) return;

      const validScopes: ApprovalScope[] = ["archive_bulk", "create_filter", "label_messages", "unarchive"];
      if (!scope || !validScopes.includes(scope)) {
        res.status(400).json({ error: `scope must be one of: ${validScopes.join(", ")}` });
        return;
      }
      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "payload is required (object)" });
        return;
      }

      const token = await createApprovalToken(userId, scope, payload);

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
  // PHASE 2 — Mutation endpoints
  // =====================================================================

  router.post("/apply_archive_bulk", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

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
        await logAction({ userId, action: "archive_bulk", status: "denied", targetSummary: { messageIds }, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ userId, action: "archive_bulk", status: "approved", targetSummary: { messageIds }, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ userId, action: "archive_bulk", status: "success", targetSummary: { messageIds }, tokenId: validation.token.id });
        res.json({ archived: messageIds, errors: [], mock: true });
        return;
      }

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

      const result = await archiveMessages(auth, messageIds);
      const status = result.errors.length === 0 ? "success" : "failure";
      await logAction({ userId, action: "archive_bulk", status, targetSummary: result, tokenId: validation.token.id, error: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined });

      res.json(result);
    } catch (err: any) {
      await logAction({ userId, action: "archive_bulk", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/apply_archive_bulk]", err);
      res.status(500).json({ error: "Failed to archive messages", detail: err.message });
    }
  });

  router.post("/create_filter", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

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
        await logAction({ userId, action: "create_filter", status: "denied", targetSummary: rule, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ userId, action: "create_filter", status: "approved", targetSummary: rule, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ userId, action: "create_filter", status: "success", targetSummary: rule, tokenId: validation.token.id });
        res.json({ filterId: "mock-filter-id", mock: true });
        return;
      }

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

      const result = await createGmailFilter(auth, rule);
      await logAction({ userId, action: "create_filter", status: "success", targetSummary: { ...rule, filterId: result.filterId }, tokenId: validation.token.id });

      res.json(result);
    } catch (err: any) {
      await logAction({ userId: userId!, action: "create_filter", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/create_filter]", err);
      res.status(500).json({ error: "Failed to create filter", detail: err.message });
    }
  });

  router.post("/label_messages", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

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
        await logAction({ userId, action: "label_messages", status: "denied", targetSummary: payload, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ userId, action: "label_messages", status: "approved", targetSummary: payload, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ userId, action: "label_messages", status: "success", targetSummary: payload, tokenId: validation.token.id });
        res.json({ labeled: messageIds, labelId: "mock-label-id", errors: [], mock: true });
        return;
      }

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

      const result = await labelMessages(auth, messageIds, label);
      const status = result.errors.length === 0 ? "success" : "failure";
      await logAction({ userId, action: "label_messages", status, targetSummary: { ...payload, labelId: result.labelId }, tokenId: validation.token.id, error: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined });

      res.json(result);
    } catch (err: any) {
      await logAction({ userId: userId!, action: "label_messages", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/label_messages]", err);
      res.status(500).json({ error: "Failed to label messages", detail: err.message });
    }
  });

  router.post("/unarchive", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

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
        await logAction({ userId, action: "unarchive", status: "denied", targetSummary: payload, tokenId: approvalToken, error: validation.message });
        res.status(403).json({ error: validation.message, code: validation.code });
        return;
      }

      await logAction({ userId, action: "unarchive", status: "approved", targetSummary: payload, tokenId: validation.token.id });

      if (config.localDevNoAuth) {
        await logAction({ userId, action: "unarchive", status: "success", targetSummary: payload, tokenId: validation.token.id });
        res.json({ unarchived: messageIds, errors: [], mock: true });
        return;
      }

      const auth = await loadGmailClient(req);
      if (!auth) { res.status(401).json({ error: "No Gmail account connected" }); return; }

      const result = await unarchiveMessages(auth, messageIds);
      const status = result.errors.length === 0 ? "success" : "failure";
      await logAction({ userId, action: "unarchive", status, targetSummary: result, tokenId: validation.token.id, error: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined });

      res.json(result);
    } catch (err: any) {
      await logAction({ userId: userId!, action: "unarchive", status: "failure", error: err.message }).catch(() => {});
      console.error("[tools/unarchive]", err);
      res.status(500).json({ error: "Failed to unarchive messages", detail: err.message });
    }
  });

  return router;
}
