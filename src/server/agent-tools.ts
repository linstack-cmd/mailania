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

// ===== Type Definitions =====

export type SuggestionKind = "archive_bulk" | "mark_read_bulk" | "create_filter" | "needs_user_input";

export interface ActionPlanStep {
  type: "archive_bulk" | "mark_read_bulk" | "create_filter" | "needs_user_input" | "label_messages";
  params: Record<string, unknown>;
  rationale?: string;
}

export interface TriageSuggestion {
  kind: SuggestionKind;
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  messageIds?: string[];
  filterDraft?: {
    from?: string;
    subjectContains?: string;
    hasWords?: string;
    label?: string;
    archive?: boolean;
    markRead?: boolean;
  };
  questions?: string[];
  actionPlan?: ActionPlanStep[];
}

const MAX_SEARCH_RESULTS = 25;
const ALLOWED_SUGGESTION_KINDS: SuggestionKind[] = [
  "archive_bulk",
  "mark_read_bulk",
  "create_filter",
  "needs_user_input",
];
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);
const AGENT_SUGGESTION_SOURCE = "agent_tool";

export interface AgentToolContext {
  userId: string;
  auth: OAuth2Client | null;
  localDev: boolean;
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
      "Get a suggestion by its ID. Returns the current suggestion payload and status.",
    input_schema: {
      type: "object" as const,
      properties: {
        suggestionId: {
          type: "string",
          description: "Suggestion ID (UUID)",
        },
      },
      required: ["suggestionId"],
    },
  },
  {
    name: "set_suggestion",
    description:
      "Update an existing suggestion's content. Takes a suggestion ID and the new suggestion fields.",
    input_schema: {
      type: "object" as const,
      properties: {
        suggestionId: {
          type: "string",
          description: "Suggestion ID (UUID)",
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
            markRead: { type: "boolean" },
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
      required: ["suggestionId", "kind", "title", "rationale", "confidence"],
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
      "Create a new actionable suggestion and add it to the user's approval queue. Use this when the user asks you to propose a new inbox action.",
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
            markRead: { type: "boolean" },
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
      rawType !== "mark_read_bulk" &&
      rawType !== "create_filter" &&
      rawType !== "needs_user_input" &&
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
      markRead: typeof draft.markRead === "boolean" ? draft.markRead : undefined,
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
      const suggestionId = args.suggestionId;
      if (typeof suggestionId !== "string" || !suggestionId.trim()) {
        throw new Error("suggestionId is required");
      }

      const pool = getPool();
      const result_query = await pool.query(
        `SELECT "id", "suggestion_json", "status", "created_at", "updated_at"
         FROM "suggestion"
         WHERE "id" = $1 AND "user_id" = $2`,
        [suggestionId, context.userId],
      );

      if (result_query.rows.length === 0) {
        throw new Error("Suggestion not found or does not belong to you");
      }

      const row = result_query.rows[0];
      const suggestion = row.suggestion_json as TriageSuggestion;

      result = {
        id: row.id,
        suggestion,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      summary = `loaded suggestion ${suggestionId} (${suggestion.kind})`;
      break;
    }

    case "set_suggestion": {
      const suggestionId = args.suggestionId;
      if (typeof suggestionId !== "string" || !suggestionId.trim()) {
        throw new Error("suggestionId is required");
      }

      const suggestion = normalizeSuggestionArgs(args);
      const pool = getPool();

      // Update the suggestion with user isolation check
      const update_result = await pool.query(
        `UPDATE "suggestion"
         SET "suggestion_json" = $1, "updated_at" = now()
         WHERE "id" = $2 AND "user_id" = $3
         RETURNING "id", "suggestion_json", "updated_at"`,
        [JSON.stringify(suggestion), suggestionId, context.userId],
      );

      if (update_result.rowCount === 0) {
        throw new Error("Suggestion not found or does not belong to you");
      }

      const updated = update_result.rows[0];

      result = {
        id: updated.id,
        suggestion: updated.suggestion_json,
        updatedAt: updated.updated_at,
      };
      summary = `updated suggestion ${suggestionId} (${suggestion.kind})`;
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
      if (!context.userId) {
        throw new Error("User ID is required for create_suggestion");
      }

      const newSuggestion = normalizeSuggestionArgs(args);
      const pool = getPool();

      // Insert directly into the suggestion table
      const insertResult = await pool.query(
        `INSERT INTO "suggestion" ("user_id", "suggestion_json", "status")
         VALUES ($1, $2, 'pending')
         RETURNING "id", "created_at"`,
        [context.userId, JSON.stringify(newSuggestion)],
      );

      const created = insertResult.rows[0];

      result = {
        id: created.id,
        suggestion: newSuggestion,
        createdAt: created.created_at,
      };
      summary = `created new suggestion (kind=${newSuggestion.kind})`;
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
