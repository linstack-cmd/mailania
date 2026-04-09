/**
 * Chat Engine for Mailania
 *
 * - generateGeneralChatResponse(): inbox-level general chat with agent tools
 *
 * SAFETY: all chat/tool flows are read-only or recommendation-only. No Gmail
 * mutations are executed from here.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TriageSuggestion } from "./agent-tools.js";
import {
  MAILANIA_AGENT_TOOL_DEFINITIONS,
  executeAgentTool,
  type AgentToolContext,
  type ToolTrace,
} from "./agent-tools.js";

/**
 * SSE event types for streaming responses.
 */
export type SSEEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; tool: string }
  | { type: "status"; phase: string; tool?: string }
  | { type: "done"; assistantText: string; suggestionsChanged: boolean; toolsUsed: Array<{ tool: string; summary: string; durationMs: number }> }
  | { type: "error"; message: string };

export type OnEventCallback = (event: SSEEvent) => void;

/**
 * Cached version of tool definitions for prompt caching.
 * Adds cache_control ephemeral marker to the last tool.
 */
const CACHED_TOOL_DEFINITIONS: Anthropic.Tool[] = (() => {
  const tools = [...MAILANIA_AGENT_TOOL_DEFINITIONS];
  if (tools.length > 0) {
    const lastTool = tools[tools.length - 1];
    tools[tools.length - 1] = {
      ...lastTool,
      cache_control: { type: "ephemeral" },
    };
  }
  return tools;
})();

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponseWithTools {
  assistantText: string;
  toolTraces: ToolTrace[];
  suggestionUpdatedByTool: boolean;
}

export interface SuggestionsContext {
  suggestions: Array<{
    id: string;
    kind: string;
    title: string;
    confidence: string;
    status: string;
    createdAt: Date;
  }>;
  recentlyResolved?: Array<{
    kind: string;
    title: string;
    status: "accepted" | "dismissed";
    updatedAt: Date;
  }>;
}



/**
 * Format a date as relative time (e.g., "3 minutes ago", "2 hours ago").
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

/**
 * Static system prompt content (cache-friendly).
 * Returns the unchanging portion of the system prompt.
 */
function buildStaticSystemPrompt(): string {
  return `You are Mailania's inbox assistant having a general conversation about the user's inbox. You help with broad inbox questions, email search, reading/summarizing specific emails, saved triage preferences, and discussion of pending suggestions.

RULES:
- Be concise and helpful
- You are read-only and recommendation-only from chat
- Never claim to archive, delete, send, label, or otherwise mutate the mailbox
- If the user asks for a mailbox-changing action, explain that you can only recommend or revise suggestions here
- Keep responses under 220 words unless the user asks for more detail
- When referring to existing suggestions, use their IDs (from the CURRENT SUGGESTIONS context) when calling get_suggestion or set_suggestion
- You can reference recently resolved suggestions to acknowledge user decisions or follow up, but you cannot modify them

GMAIL DOMAIN KNOWLEDGE:

Gmail uses a label-based model, not folders. Every message can have multiple labels simultaneously. Key concepts:

- **Threads & Conversations**: Gmail groups messages into threads (conversations). Operations can target individual messages or entire threads. When you archive a thread and then a new reply arrives, the thread returns to the INBOX.

- **Labels**: Labels are not folders. A message can have many labels. "Moving" a message means adding one label and removing another. System labels include:
  - INBOX, SENT, DRAFT, SPAM, TRASH, STARRED, IMPORTANT, UNREAD
  - Category labels: CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS
  - User can manually control most labels, but cannot manually add SENT or DRAFT labels.

- **Archive**: Removes the INBOX label. The message is NOT deleted; it exists in "All Mail" and remains searchable.

- **Delete**: Moves to TRASH (adds TRASH label). Auto-purged after 30 days.

- **Read/Unread**: Controlled by the UNREAD label. "Mark as read" removes UNREAD; "mark as unread" adds it back.

- **Filters**: 
  - Match criteria: from, to, subject, has words, doesn't have words, size, has attachment
  - Actions: skip inbox (remove INBOX label), mark read (remove UNREAD), star (add STARRED), apply label, forward, delete, never send to spam (add category label or allowlist), mark important (add IMPORTANT), categorize
  - By default, filters apply only to future incoming mail
  - There is a separate "also apply to existing matching conversations" option that affects historical mail
  - When suggesting a filter via create_filter, understand that it may need explicit user configuration to apply retroactively

- **Gmail Search Syntax**: The search_emails tool uses Gmail query syntax. Key operators:
  - from:, to:, subject:, label:, in:, is:, has:attachment, filename:, after:, before:, newer_than:, older_than:, category:
  - Note: No regex support. OR must be in ALL CAPS. Implicit AND between criteria. Limited boolean expressions.

TOOL USAGE:
- You have access to exactly these Mailania tools and nothing else:
  1) get_triage_preferences
  2) set_triage_preferences
  3) get_suggestion - Get a suggestion by its ID
  4) set_suggestion - Update an existing suggestion's content by its ID
  5) read_email
  6) search_emails
  7) create_suggestion - Create a brand new suggestion for the user's approval queue
- These tools are recommendation-only. They do NOT apply mailbox actions.
- Use search_emails for inbox-wide questions, finding messages, counting matches, or identifying examples
- Use read_email when the user asks to inspect or summarize a specific message
- Use get_triage_preferences / set_triage_preferences only for durable inbox preferences the user wants remembered
- Use get_suggestion / set_suggestion when inspecting or modifying a specific suggestion (pass the suggestion ID)
- Use create_suggestion when the user asks for a new recommendation to be added
- Do NOT use tools for every message — only when saved state or mailbox data would genuinely help the answer

SUGGESTION KINDS:
Use these suggestion types appropriately:
- archive_bulk: specific message IDs you want removed from the inbox (one-time bulk action). Archives messages by removing the INBOX label.
- mark_read_bulk: specific message IDs to declutter without archiving (one-time bulk action). Removes the UNREAD label.
- create_filter: a pattern worth automating. Filters apply to future incoming mail by default. Users can optionally configure retroactive application to existing matching conversations in Gmail's filter settings.
- needs_user_input: when you need clarification from the user before proposing an action`;
}

/**
 * Dynamic system prompt content (changes per request).
 * Returns the current suggestions and recently resolved suggestions blocks.
 */
function buildDynamicSystemPrompt(suggestionsContext: SuggestionsContext | null): string {
  const suggestionsBlock =
    suggestionsContext && suggestionsContext.suggestions.length > 0
      ? suggestionsContext.suggestions
          .map(
            (s) =>
              `- ID: ${s.id}, Kind: ${s.kind}, Title: "${s.title}", Confidence: ${s.confidence}, Status: ${s.status}`,
          )
          .join("\n")
      : "No suggestions yet. Create them with the create_suggestion tool.";

  const resolvedBlock =
    suggestionsContext && suggestionsContext.recentlyResolved && suggestionsContext.recentlyResolved.length > 0
      ? suggestionsContext.recentlyResolved
          .map((s) => `- [${s.status}] ${s.kind}: "${s.title}" (${formatRelativeTime(s.updatedAt)})`)
          .join("\n")
      : null;

  return `CURRENT SUGGESTIONS:
${suggestionsBlock}
${resolvedBlock ? `\nRECENTLY RESOLVED SUGGESTIONS:\n${resolvedBlock}` : ""}`;
}

/**
 * Structured system prompt with static and dynamic components.
 * Separates cache-friendly static content from per-request dynamic content.
 */
interface StructuredSystemPrompt {
  static: string;
  dynamic: string;
}

function buildGeneralChatSystemPrompt(suggestionsContext: SuggestionsContext | null): StructuredSystemPrompt {
  return {
    static: buildStaticSystemPrompt(),
    dynamic: buildDynamicSystemPrompt(suggestionsContext),
  };
}

/**
 * Estimate tokens from a message array using a character-based heuristic.
 * Standard estimate: ~1 token per 4 characters.
 */
function estimateTokens(messages: Anthropic.MessageParam[]): number {
  let charCount = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      charCount += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === "object" && "text" in block && typeof (block as any).text === "string") {
          charCount += (block as any).text.length;
        }
      }
    }
  }
  return Math.ceil(charCount / 4);
}

/**
 * Compact messages to fit within a token budget.
 * Drops messages from the front (oldest) until under budget.
 * Ensures first message is user role, and adds synthetic trim marker if needed.
 */
function compactMessagesToBudget(
  messages: Anthropic.MessageParam[],
  budgetTokens: number,
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;

  const estimatedTokens = estimateTokens(messages);
  if (estimatedTokens <= budgetTokens) {
    return messages; // Fast path: no compaction needed
  }

  // Start from the last message (current user message) and work backwards
  let compacted = [...messages];

  // Drop from the front until we fit the budget
  while (compacted.length > 1 && estimateTokens(compacted) > budgetTokens) {
    compacted.shift();
  }

  // If there's at least one message left, ensure it's a user message
  // (API requires messages to start with "user" role)
  if (compacted.length > 0 && compacted[0].role === "assistant") {
    compacted.shift();
  }

  // If we dropped messages, prepend a synthetic trim marker
  if (compacted.length < messages.length) {
    const trimmedCount = messages.length - compacted.length;
    const trimmarker: Anthropic.MessageParam[] = [
      {
        role: "user" as const,
        content: `[Earlier messages trimmed for context length (${trimmedCount} message${trimmedCount !== 1 ? "s" : ""} removed)]`,
      },
      {
        role: "assistant" as const,
        content:
          "I understand. I'll continue our conversation with the context provided.",
      },
    ];
    compacted = [...trimmarker, ...compacted];
  }

  return compacted;
}

async function runChatWithTools(
  structuredPrompt: StructuredSystemPrompt,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
  toolContext: AgentToolContext,
  onEvent?: OnEventCallback,
  abortSignal?: AbortSignal,
): Promise<ChatResponseWithTools> {
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [];

  for (const m of chatHistory) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  // Compact messages to fit within 100k token budget for history
  const HISTORY_BUDGET_TOKENS = 100000;
  const compacted = compactMessagesToBudget(messages, HISTORY_BUDGET_TOKENS);

  const MAX_TOOL_ROUNDS = 5;
  const toolTraces: ToolTrace[] = [];
  let accumulatedText = ""; // Accumulates text from the final turn only (not tool round text)

  let rounds = 0;
  let response: Anthropic.Message;

  /**
   * Construct the system array with static (cached) and dynamic blocks.
   * Static block gets cache_control, dynamic does not (it changes every request).
   */
  const buildSystemArray = (): Anthropic.TextBlockParam[] => {
    return [
      {
        type: "text",
        text: structuredPrompt.static,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: structuredPrompt.dynamic,
        // No cache_control on dynamic block — it changes per request
      },
    ];
  };

  // Make the first API call with streaming
  {
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      system: buildSystemArray(),
      messages: compacted,
      tools: CACHED_TOOL_DEFINITIONS,
      cache_control: { type: "ephemeral" },
    }, { signal: abortSignal });

    let textBuffer = "";
    
    // Consume stream and emit tokens as they arrive (real-time streaming)
    for await (const evt of stream) {
      if (evt.type === "content_block_delta") {
        const delta = evt.delta as any;
        if (delta.type === "text_delta" && delta.text) {
          textBuffer += delta.text;
          // Emit token immediately for real-time streaming (we'll clear on tool_start if needed)
          onEvent?.({ type: "token", text: delta.text });
        }
      }
    }

    response = await stream.finalMessage();

    // If this first call is end_turn (no tools), we're done streaming the final response
    if (response.stop_reason === "end_turn") {
      accumulatedText = textBuffer;
      return {
        assistantText: accumulatedText.trim(),
        toolTraces,
        suggestionUpdatedByTool: false,
      };
    }

    // Otherwise, it's a tool round. Emit tool_start for each tool to signal client to clear buffer.
    // (The textBuffer we emitted were pre-tool text — client will clear them)
    for (const block of response.content) {
      if (block.type === "tool_use") {
        onEvent?.({ type: "tool_start", tool: block.name });
      }
    }
  }

  // Tool loop: handle tool_use rounds
  while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");
    if (toolUseBlocks.length === 0) break;

    compacted.push({
      role: "assistant",
      content: response.content.map((block) => {
        if (block.type === "tool_use") {
          return {
            type: "tool_use" as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        }
        return { type: "text" as const, text: (block as any).text ?? "" };
      }),
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolBlock of toolUseBlocks) {
      const tb = toolBlock as {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      };

      try {
        const execResult = await executeAgentTool(toolContext, tb.name, tb.input);
        toolTraces.push(execResult.trace);
        onEvent?.({ type: "status", phase: "tool_done", tool: tb.name });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: JSON.stringify(execResult.result),
        });
      } catch (err: any) {
        toolTraces.push({
          toolName: tb.name,
          args: tb.input,
          resultSummary: `error: ${err.message}`,
          durationMs: 0,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: JSON.stringify({ error: err.message }),
          is_error: true,
        });
      }
    }

    compacted.push({ role: "user", content: toolResults });

    // Stream the next response (this will be the final turn after tools)
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      system: buildSystemArray(),
      messages: compacted,
      tools: CACHED_TOOL_DEFINITIONS,
      cache_control: { type: "ephemeral" },
    }, { signal: abortSignal });

    let textBuffer = "";

    // Consume stream and emit tokens as they arrive (real-time streaming for final response)
    for await (const evt of stream) {
      if (evt.type === "content_block_delta") {
        const delta = evt.delta as any;
        if (delta.type === "text_delta" && delta.text) {
          textBuffer += delta.text;
          // Emit token immediately for real-time streaming
          onEvent?.({ type: "token", text: delta.text });
        }
      }
    }

    response = await stream.finalMessage();
    // Reset accumulatedText for this turn (since previous turns might have had pre-tool text)
    accumulatedText = textBuffer;

    if (response.stop_reason === "end_turn") {
      break;
    }

    // If this turn also has tool_use, emit tool_start again and loop
    for (const block of response.content) {
      if (block.type === "tool_use") {
        onEvent?.({ type: "tool_start", tool: block.name });
      }
    }
  }

  return {
    assistantText: accumulatedText.trim(),
    toolTraces,
    suggestionUpdatedByTool: toolTraces.some(
      (trace) => (trace.toolName === "set_suggestion" || trace.toolName === "create_suggestion") && !trace.resultSummary.startsWith("error:"),
    ),
  };
}



/**
 * Inbox-level general chat.
 */
export async function generateGeneralChatResponse(
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
  toolContext: AgentToolContext,
  suggestionsContext: SuggestionsContext | null,
  onEvent?: OnEventCallback,
  abortSignal?: AbortSignal,
): Promise<ChatResponseWithTools> {
  const structuredPrompt = buildGeneralChatSystemPrompt(suggestionsContext);
  return runChatWithTools(
    structuredPrompt,
    chatHistory,
    userMessage,
    apiKey,
    model,
    toolContext,
    onEvent,
    abortSignal,
  );
}


