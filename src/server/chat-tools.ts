/**
 * Chat Tool Execution Layer
 *
 * Defines the allowlisted tools that the chat agent can call during
 * suggestion conversations. Only read-only tools are permitted — no
 * mutations are callable from chat unless an explicit approval flow
 * is used (not implemented here; chat remains suggest-only).
 *
 * SAFETY: All tools in the allowlist are strictly read-only Gmail
 * operations. The allowlist is enforced at execution time.
 */

import type { OAuth2Client } from "google-auth-library";
import {
  searchMessages,
  listInbox,
  getMessage,
  type InboxMessage,
  type SearchMessagesResult,
  type GmailFullMessage,
} from "./gmail.js";
import { MOCK_INBOX_MESSAGES } from "./mock-data.js";
import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool_use format)
// ---------------------------------------------------------------------------

export const CHAT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "search_messages",
    description:
      "Search the user's Gmail messages using Gmail query syntax (e.g., 'from:noreply@github.com', 'subject:invoice', 'is:unread'). " +
      "Returns matching messages with count and Gmail's resultSizeEstimate (approximate total matches). " +
      "Use this to answer questions about email volume, sender patterns, or to find specific messages.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Gmail search query string",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum messages to return (default 10, max 25). Use smaller values for counting; larger for sampling.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_inbox",
    description:
      "List the user's current inbox messages (most recent first). " +
      "Useful for getting a snapshot of what's in the inbox right now.",
    input_schema: {
      type: "object" as const,
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum messages to return (default 10, max 25)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_message",
    description:
      "Get details for a single message by ID. Returns subject, from, to, cc, date, and snippet. " +
      "Use this when you need more detail about a specific message referenced in the suggestion.",
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
];

/** Names of all allowed tools — enforced at execution time */
const ALLOWED_TOOLS = new Set(CHAT_TOOL_DEFINITIONS.map((t) => t.name));

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

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

/**
 * Execute a single tool call. Returns the result and a trace for audit.
 *
 * @param auth - OAuth2Client for Gmail API calls (null in local dev mode)
 * @param localDev - Whether we're in local dev mode (use mock data)
 * @param toolName - Name of the tool to execute
 * @param args - Tool arguments
 */
export async function executeTool(
  auth: OAuth2Client | null,
  localDev: boolean,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  if (!ALLOWED_TOOLS.has(toolName)) {
    throw new Error(`Tool "${toolName}" is not in the chat allowlist`);
  }

  const start = Date.now();
  let result: unknown;
  let summary: string;

  switch (toolName) {
    case "search_messages": {
      const query = args.query as string;
      const maxResults = Math.min((args.maxResults as number) || 10, 25);

      if (localDev) {
        const q = query.toLowerCase();
        const matches = MOCK_INBOX_MESSAGES.filter(
          (m) =>
            m.subject.toLowerCase().includes(q) ||
            m.from.toLowerCase().includes(q) ||
            m.snippet.toLowerCase().includes(q),
        ).slice(0, maxResults);
        result = {
          messages: matches,
          count: matches.length,
          resultSizeEstimate: null,
        };
        summary = `search "${query}": ${matches.length} results (mock)`;
      } else {
        const searchResult = await searchMessages(auth!, query, maxResults);
        result = searchResult;
        summary = `search "${query}": ${searchResult.count} returned, ~${searchResult.resultSizeEstimate ?? "?"} estimated`;
      }
      break;
    }

    case "list_inbox": {
      const maxResults = Math.min((args.maxResults as number) || 10, 25);

      if (localDev) {
        const messages = MOCK_INBOX_MESSAGES.slice(0, maxResults);
        result = { messages };
        summary = `list_inbox: ${messages.length} messages (mock)`;
      } else {
        const messages = await listInbox(auth!, maxResults);
        result = { messages };
        summary = `list_inbox: ${messages.length} messages`;
      }
      break;
    }

    case "get_message": {
      const messageId = args.messageId as string;

      if (localDev) {
        const mock = MOCK_INBOX_MESSAGES.find((m) => m.id === messageId);
        if (!mock) {
          result = { error: "Message not found" };
          summary = `get_message ${messageId}: not found (mock)`;
        } else {
          result = { message: mock };
          summary = `get_message ${messageId}: "${mock.subject}"`;
        }
      } else {
        try {
          const message = await getMessage(auth!, messageId);
          result = { message };
          summary = `get_message ${messageId}: "${message.subject}"`;
        } catch (err: any) {
          if (err?.code === 404 || err?.response?.status === 404) {
            result = { error: "Message not found" };
            summary = `get_message ${messageId}: not found`;
          } else {
            throw err;
          }
        }
      }
      break;
    }

    default:
      throw new Error(`Unhandled tool: ${toolName}`);
  }

  const durationMs = Date.now() - start;

  return {
    result,
    trace: {
      toolName,
      args,
      resultSummary: summary,
      durationMs,
    },
  };
}
