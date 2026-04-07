/**
 * Mailania agent tool registry.
 *
 * This is the server-side allowlist of capabilities the Mailania agent can call.
 * The list is intentionally narrow and recommendation-only:
 *
 * 1) get_triage_preferences
 * 2) set_triage_preferences
 * 3) get_suggestion
 * 4) set_suggestion
 * 5) read_email
 * 6) search_emails
 * 7) create_suggestion
 *
 * No mailbox mutation tools are exposed here.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { OAuth2Client } from "google-auth-library";
import { getPool } from "./db.js";
import {
  getUserTriagePreferences,
  updateUserTriagePreferences,
} from "./user-preferences.js";
import {
  getMessage,
  searchMessages,
} from "./gmail.js";
import { MOCK_INBOX_MESSAGES } from "./mock-data.js";
import type { TriageSuggestion, ActionPlanStep, SuggestionKind } from "./triage.js";

const MAX_SEARCH_RESULTS = 25;
const ALLOWED_SUGGESTION_KINDS: SuggestionKind[] = [
  "archive_bulk",
  "create_filter",
  "needs_user_input",
  "mark_read",
];
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);
const AGENT_SUGGESTION_SOURCE = "agent_tool";

export interface AgentToolContext {
  userId: string;
  auth: OAuth2Client | null;
  localDev: boolean;
  runId?: string;
  suggestionIndex?: number;
  conversationId?: string;
}

export interface ToolTrace {
  toolName: string;
  args: Record<string, unknown>;
  resultSummary: string;
  durationMs: number;
}

export interface ToolExecResult {
  result: unknown;
  trace: ToolTrace;
}

export interface SuggestionRevisionRecord {
  id: string;
  revisionIndex: number;
  suggestion: TriageSuggestion;
  source: string;
  createdAt: Date;
}

export const MAILANIA_AGENT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_triage_preferences",
    description:
      "Get the user's saved triage preferences. Use this before changing long-term inbox preferences or when the user asks what guidance is currently saved.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "set_triage_preferences",
    description:
      "Save or replace the user's long-term triage preferences. Use only when the user clearly states a durable inbox preference they want Mailania to remember.",
    input_schema: {
      type: "object" as const,
      properties: {
        triagePreferences: {
          type: "string",
          description: "The complete triage preference text to save",
        },
      },
      required: ["triagePreferences"],
    },
  },
  {
    name: "get_suggestion",
    description:
      "Get the current suggestion for a triage item, including the original suggestion, latest saved revision, and active suggestion.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "Triage run ID. Optional when operating on the current chat suggestion.",
        },
        suggestionIndex: {
          type: "number",
          description: "Zero-based suggestion index. Optional when operating on the current chat suggestion.",
        },
      },
      required: [],
    },
  },
  {
    name: "set_suggestion",
    description:
      "Save a revised recommendation for a triage item. This only updates Mailania's stored suggestion/recommendation. It must never execute any mailbox action.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "Triage run ID. Optional when operating on the current chat suggestion.",
        },
        suggestionIndex: {
          type: "number",
          description: "Zero-based suggestion index. Optional when operating on the current chat suggestion.",
        },
        kind: {
          type: "string",
          enum: ALLOWED_SUGGESTION_KINDS,
          description: "Recommendation kind",
        },
        title: {
          type: "string",
          description: "Short title for the recommendation",
        },
        rationale: {
          type: "string",
          description: "Why this recommendation makes sense",
        },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Confidence level",
        },
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional related Gmail message IDs",
        },
        filterDraft: {
          type: "object",
          description: "Optional filter draft for recommendation-only filter suggestions",
          properties: {
            from: { type: "string" },
            subjectContains: { type: "string" },
            hasWords: { type: "string" },
            label: { type: "string" },
            archive: { type: "boolean" },
          },
          required: [],
        },
        questions: {
          type: "array",
          items: { type: "string" },
          description: "Optional clarifying questions for the user",
        },
        actionPlan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              params: { type: "object" },
              rationale: { type: "string" },
            },
            required: ["type", "params"],
          },
          description: "Optional multi-step recommendation plan. This is still recommendation-only.",
        },
      },
      required: ["kind", "title", "rationale", "confidence"],
    },
  },
  {
    name: "read_email",
    description:
      "Read a single email by Gmail message ID. Returns metadata and snippet. Use this when the user asks about a specific message.",
    input_schema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "Gmail message ID",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "search_emails",
    description:
      "Search the user's Gmail using Gmail query syntax. Returns matching emails plus count and resultSizeEstimate.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Gmail search query string",
        },
        maxResults: {
          type: "number",
          description: `Maximum emails to return (default 10, max ${MAX_SEARCH_RESULTS})`,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_suggestion",
    description:
      "Create a brand new suggestion and append it to the current triage run. This adds a new suggestion to the list of recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: {
          type: "string",
          enum: ALLOWED_SUGGESTION_KINDS,
          description: "Recommendation kind",
        },
        title: {
          type: "string",
          description: "Short title for the recommendation",
        },
        rationale: {
          type: "string",
          description: "Why this recommendation makes sense",
        },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Confidence level",
        },
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional related Gmail message IDs",
        },
        filterDraft: {
          type: "object",
          description: "Optional filter draft for recommendation-only filter suggestions",
          properties: {
            from: { type: "string" },
            subjectContains: { type: "string" },
            hasWords: { type: "string" },
            label: { type: "string" },
            archive: { type: "boolean" },
          },
          required: [],
        },
        questions: {
          type: "array",
          items: { type: "string" },
          description: "Optional clarifying questions for the user",
        },
        actionPlan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              params: { type: "object" },
              rationale: { type: "string" },
            },
            required: ["type", "params"],
          },
          description: "Optional multi-step recommendation plan. This is still recommendation-only.",
        },
      },
      required: ["kind", "title", "rationale", "confidence"],
    },
  },
];

const ALLOWED_TOOLS = new Set(MAILANIA_AGENT_TOOL_DEFINITIONS.map((tool) => tool.name));

function requireCurrentSuggestionTarget(context: AgentToolContext, args: Record<string, unknown>) {
  const runId = (args.runId as string | undefined) ?? context.runId;
  const rawIndex = (args.suggestionIndex as number | undefined) ?? context.suggestionIndex;

  if (!runId) {
    throw new Error("runId is required for suggestion tools outside an active suggestion chat");
  }
  if (typeof rawIndex !== "number" || !Number.isInteger(rawIndex) || rawIndex < 0) {
    throw new Error("suggestionIndex is required and must be a non-negative integer");
  }

  return {
    runId,
    suggestionIndex: rawIndex,
  };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of strings");
  }

  const result = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : undefined;
}

function normalizeActionPlan(value: unknown): ActionPlanStep[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("actionPlan must be an array");
  }

  const actionPlan = value.map((step, index) => {
    if (!step || typeof step !== "object") {
      throw new Error(`actionPlan[${index}] must be an object`);
    }

    const rawType = (step as Record<string, unknown>).type;
    const params = (step as Record<string, unknown>).params;
    const rationale = (step as Record<string, unknown>).rationale;

    if (typeof rawType !== "string" || !rawType.trim()) {
      throw new Error(`actionPlan[${index}].type is required`);
    }
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new Error(`actionPlan[${index}].params must be an object`);
    }
    if (
      rawType !== "archive_bulk" &&
      rawType !== "create_filter" &&
      rawType !== "needs_user_input" &&
      rawType !== "mark_read" &&
      rawType !== "label_messages"
    ) {
      throw new Error(`actionPlan[${index}].type is not allowed`);
    }

    return {
      type: rawType as ActionPlanStep["type"],
      params: params as Record<string, unknown>,
      rationale: typeof rationale === "string" ? rationale.trim() || undefined : undefined,
    };
  });

  return actionPlan.length > 0 ? actionPlan : undefined;
}

function normalizeSuggestionArgs(args: Record<string, unknown>): TriageSuggestion {
  const kind = typeof args.kind === "string" ? args.kind : "";
  const title = typeof args.title === "string" ? args.title.trim() : "";
  const rationale = typeof args.rationale === "string" ? args.rationale.trim() : "";
  const confidence = typeof args.confidence === "string" ? args.confidence : "";

  if (!ALLOWED_SUGGESTION_KINDS.includes(kind as SuggestionKind)) {
    throw new Error(`kind must be one of: ${ALLOWED_SUGGESTION_KINDS.join(", ")}`);
  }
  if (!title) throw new Error("title is required");
  if (!rationale) throw new Error("rationale is required");
  if (!ALLOWED_CONFIDENCE.has(confidence)) {
    throw new Error('confidence must be one of: low, medium, high');
  }

  const filterDraftValue = args.filterDraft;
  let filterDraft: TriageSuggestion["filterDraft"] | undefined;
  if (filterDraftValue != null) {
    if (!filterDraftValue || typeof filterDraftValue !== "object" || Array.isArray(filterDraftValue)) {
      throw new Error("filterDraft must be an object");
    }
    const draft = filterDraftValue as Record<string, unknown>;
    filterDraft = {
      from: typeof draft.from === "string" ? draft.from.trim() || undefined : undefined,
      subjectContains:
        typeof draft.subjectContains === "string"
          ? draft.subjectContains.trim() || undefined
          : undefined,
      hasWords: typeof draft.hasWords === "string" ? draft.hasWords.trim() || undefined : undefined,
      label: typeof draft.label === "string" ? draft.label.trim() || undefined : undefined,
      archive: typeof draft.archive === "boolean" ? draft.archive : undefined,
    };
  }

  return {
    kind: kind as SuggestionKind,
    title,
    rationale,
    confidence: confidence as TriageSuggestion["confidence"],
    messageIds: normalizeStringArray(args.messageIds),
    filterDraft,
    questions: normalizeStringArray(args.questions),
    actionPlan: normalizeActionPlan(args.actionPlan),
  };
}

async function loadSuggestionState(
  userId: string,
  runId: string,
  suggestionIndex: number,
): Promise<{
  originalSuggestion: TriageSuggestion;
  latestRevision: SuggestionRevisionRecord | null;
  activeSuggestion: TriageSuggestion;
}> {
  const pool = getPool();

  const runResult = await pool.query(
    `SELECT "suggestions" FROM "triage_run"
     WHERE "id" = $1 AND "user_id" = $2`,
    [runId, userId],
  );

  if (runResult.rows.length === 0) {
    throw new Error("Triage run not found");
  }

  const suggestions = runResult.rows[0].suggestions as TriageSuggestion[];
  if (suggestionIndex < 0 || suggestionIndex >= suggestions.length) {
    throw new Error("Suggestion index out of range");
  }

  const originalSuggestion = suggestions[suggestionIndex];

  const revResult = await pool.query(
    `SELECT sr."id", sr."revision_index", sr."suggestion_json", sr."source", sr."created_at"
     FROM "suggestion_conversation" sc
     JOIN "suggestion_revision" sr ON sr."conversation_id" = sc."id"
     WHERE sc."run_id" = $1 AND sc."suggestion_index" = $2 AND sc."user_id" = $3
     ORDER BY sr."revision_index" DESC, sr."created_at" DESC, sr."id" DESC
     LIMIT 1`,
    [runId, suggestionIndex, userId],
  );

  const latestRevision = revResult.rows.length > 0
    ? {
        id: revResult.rows[0].id as string,
        revisionIndex: Number(revResult.rows[0].revision_index),
        suggestion: revResult.rows[0].suggestion_json as TriageSuggestion,
        source: revResult.rows[0].source as string,
        createdAt: revResult.rows[0].created_at as Date,
      }
    : null;

  return {
    originalSuggestion,
    latestRevision,
    activeSuggestion: latestRevision?.suggestion ?? originalSuggestion,
  };
}

async function ensureConversation(
  userId: string,
  runId: string,
  suggestionIndex: number,
  existingConversationId?: string,
): Promise<string> {
  if (existingConversationId) return existingConversationId;

  const pool = getPool();
  const existing = await pool.query(
    `SELECT "id" FROM "suggestion_conversation"
     WHERE "run_id" = $1 AND "suggestion_index" = $2 AND "user_id" = $3`,
    [runId, suggestionIndex, userId],
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id as string;
  }

  const created = await pool.query(
    `INSERT INTO "suggestion_conversation" ("run_id", "suggestion_index", "user_id")
     VALUES ($1, $2, $3)
     RETURNING "id"`,
    [runId, suggestionIndex, userId],
  );

  return created.rows[0].id as string;
}

export async function saveSuggestionRevision(
  context: AgentToolContext,
  params: {
    runId?: string;
    suggestionIndex?: number;
    suggestion: TriageSuggestion;
    source?: string;
  },
): Promise<SuggestionRevisionRecord> {
  const target = requireCurrentSuggestionTarget(context, params as unknown as Record<string, unknown>);
  const pool = getPool();

  await loadSuggestionState(context.userId, target.runId, target.suggestionIndex);

  const conversationId = await ensureConversation(
    context.userId,
    target.runId,
    target.suggestionIndex,
    context.conversationId,
  );

  const revCountResult = await pool.query(
    `SELECT COALESCE(MAX("revision_index"), -1)::int as max_idx
     FROM "suggestion_revision"
     WHERE "conversation_id" = $1`,
    [conversationId],
  );
  const nextRevisionIndex = Number(revCountResult.rows[0].max_idx) + 1;

  const insertResult = await pool.query(
    `INSERT INTO "suggestion_revision" ("conversation_id", "revision_index", "suggestion_json", "source")
     VALUES ($1, $2, $3, $4)
     RETURNING "id", "created_at"`,
    [conversationId, nextRevisionIndex, JSON.stringify(params.suggestion), params.source ?? AGENT_SUGGESTION_SOURCE],
  );

  await pool.query(
    `UPDATE "suggestion_conversation" SET "updated_at" = now() WHERE "id" = $1`,
    [conversationId],
  );

  return {
    id: insertResult.rows[0].id as string,
    revisionIndex: nextRevisionIndex,
    suggestion: params.suggestion,
    source: params.source ?? AGENT_SUGGESTION_SOURCE,
    createdAt: insertResult.rows[0].created_at as Date,
  };
}

export async function getLatestSuggestionRevision(
  context: AgentToolContext,
  runId?: string,
  suggestionIndex?: number,
): Promise<SuggestionRevisionRecord | null> {
  const target = requireCurrentSuggestionTarget(context, {
    runId,
    suggestionIndex,
  });
  const state = await loadSuggestionState(context.userId, target.runId, target.suggestionIndex);
  return state.latestRevision;
}

export async function executeAgentTool(
  context: AgentToolContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  if (!ALLOWED_TOOLS.has(toolName)) {
    throw new Error(`Tool "${toolName}" is not allowed for the Mailania agent`);
  }

  const start = Date.now();
  let result: unknown;
  let summary = "ok";

  switch (toolName) {
    case "get_triage_preferences": {
      const triagePreferences = await getUserTriagePreferences(context.userId);
      result = { triagePreferences };
      summary = triagePreferences
        ? `loaded triage preferences (${triagePreferences.length} chars)`
        : "loaded empty triage preferences";
      break;
    }

    case "set_triage_preferences": {
      const triagePreferences = await updateUserTriagePreferences(
        context.userId,
        typeof args.triagePreferences === "string" ? args.triagePreferences : "",
      );
      result = { triagePreferences };
      summary = triagePreferences
        ? `saved triage preferences (${triagePreferences.length} chars)`
        : "cleared triage preferences";
      break;
    }

    case "get_suggestion": {
      const target = requireCurrentSuggestionTarget(context, args);
      const state = await loadSuggestionState(
        context.userId,
        target.runId,
        target.suggestionIndex,
      );
      result = {
        runId: target.runId,
        suggestionIndex: target.suggestionIndex,
        originalSuggestion: state.originalSuggestion,
        latestRevision: state.latestRevision
          ? {
              id: state.latestRevision.id,
              revisionIndex: state.latestRevision.revisionIndex,
              suggestion: state.latestRevision.suggestion,
              source: state.latestRevision.source,
              createdAt: state.latestRevision.createdAt,
            }
          : null,
        activeSuggestion: state.activeSuggestion,
      };
      summary = `loaded suggestion ${target.suggestionIndex} for run ${target.runId}`;
      break;
    }

    case "set_suggestion": {
      const target = requireCurrentSuggestionTarget(context, args);
      const suggestion = normalizeSuggestionArgs(args);
      const revision = await saveSuggestionRevision(context, {
        runId: target.runId,
        suggestionIndex: target.suggestionIndex,
        suggestion,
        source: AGENT_SUGGESTION_SOURCE,
      });
      result = {
        runId: target.runId,
        suggestionIndex: target.suggestionIndex,
        revisionIndex: revision.revisionIndex,
        suggestion: revision.suggestion,
        source: revision.source,
        createdAt: revision.createdAt,
      };
      summary = `saved suggestion revision v${revision.revisionIndex + 1} (${suggestion.kind})`;
      break;
    }

    case "read_email": {
      const messageId = args.messageId;
      if (typeof messageId !== "string" || !messageId.trim()) {
        throw new Error("messageId is required");
      }

      if (context.localDev) {
        const mock = MOCK_INBOX_MESSAGES.find((message) => message.id === messageId);
        if (!mock) {
          result = { error: "Message not found" };
          summary = `read_email ${messageId}: not found (mock)`;
        } else {
          result = { message: mock };
          summary = `read_email ${messageId}: ${mock.subject}`;
        }
      } else {
        try {
          const message = await getMessage(context.auth!, messageId);
          result = { message };
          summary = `read_email ${messageId}: ${message.subject}`;
        } catch (err: any) {
          if (err?.code === 404 || err?.response?.status === 404) {
            result = { error: "Message not found" };
            summary = `read_email ${messageId}: not found`;
          } else {
            throw err;
          }
        }
      }
      break;
    }

    case "search_emails": {
      const query = args.query;
      if (typeof query !== "string" || !query.trim()) {
        throw new Error("query is required");
      }

      const maxResults = Math.min(
        Math.max(Number(args.maxResults) || 10, 1),
        MAX_SEARCH_RESULTS,
      );

      if (context.localDev) {
        const q = query.toLowerCase();
        const messages = MOCK_INBOX_MESSAGES.filter(
          (message) =>
            message.subject.toLowerCase().includes(q) ||
            message.from.toLowerCase().includes(q) ||
            message.snippet.toLowerCase().includes(q),
        ).slice(0, maxResults);
        result = {
          messages,
          count: messages.length,
          resultSizeEstimate: null,
        };
        summary = `search_emails \"${query}\": ${messages.length} results (mock)`;
      } else {
        const searchResult = await searchMessages(context.auth!, query, maxResults);
        result = searchResult;
        summary = `search_emails \"${query}\": ${searchResult.count} returned, ~${searchResult.resultSizeEstimate ?? "?"} estimated`;
      }
      break;
    }

    case "create_suggestion": {
      // Validate that runId is set in context
      if (!context.runId) {
        throw new Error("runId is required for create_suggestion tool");
      }

      const pool = getPool();

      // Load current suggestions to get the next index
      const runResult = await pool.query(
        `SELECT "suggestions" FROM "triage_run"
         WHERE "id" = $1 AND "user_id" = $2`,
        [context.runId, context.userId],
      );

      if (runResult.rows.length === 0) {
        throw new Error("Triage run not found");
      }

      const suggestions = (runResult.rows[0].suggestions || []) as TriageSuggestion[];
      const newSuggestionIndex = suggestions.length;

      // Normalize and validate the suggestion payload
      const newSuggestion = normalizeSuggestionArgs(args);

      // Append to suggestions array using JSONB concatenation
      await pool.query(
        `UPDATE "triage_run" 
         SET "suggestions" = COALESCE("suggestions", '[]'::jsonb) || $1::jsonb
         WHERE "id" = $2 AND "user_id" = $3`,
        [JSON.stringify([newSuggestion]), context.runId, context.userId],
      );

      // Create a suggestion_conversation record (if needed for tracking)
      // Don't pass context.conversationId — let it create a fresh conversation for the new suggestion
      const conversationId = await ensureConversation(
        context.userId,
        context.runId,
        newSuggestionIndex,
      );

      // Save initial revision with source "agent_tool"
      const insertResult = await pool.query(
        `INSERT INTO "suggestion_revision" ("conversation_id", "revision_index", "suggestion_json", "source")
         VALUES ($1, $2, $3, $4)
         RETURNING "id", "created_at"`,
        [conversationId, 0, JSON.stringify(newSuggestion), AGENT_SUGGESTION_SOURCE],
      );

      result = {
        runId: context.runId,
        suggestionIndex: newSuggestionIndex,
        suggestion: newSuggestion,
        revisionIndex: 0,
        source: AGENT_SUGGESTION_SOURCE,
        createdAt: insertResult.rows[0].created_at as Date,
      };
      summary = `created new suggestion (kind=${newSuggestion.kind}) at index ${newSuggestionIndex}`;
      break;
    }

    default:
      throw new Error(`Unhandled Mailania agent tool: ${toolName}`);
  }

  return {
    result,
    trace: {
      toolName,
      args,
      resultSummary: summary,
      durationMs: Date.now() - start,
    },
  };
}
