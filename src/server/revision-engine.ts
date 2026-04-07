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
}



function buildGeneralChatSystemPrompt(suggestionsContext: SuggestionsContext | null): string {
  const suggestionsBlock =
    suggestionsContext && suggestionsContext.suggestions.length > 0
      ? suggestionsContext.suggestions
          .map(
            (s) =>
              `- ID: ${s.id}, Kind: ${s.kind}, Title: "${s.title}", Confidence: ${s.confidence}, Status: ${s.status}`,
          )
          .join("\n")
      : "No suggestions yet. Create them with the create_suggestion tool.";

  return `You are Mailania's inbox assistant having a general conversation about the user's inbox. You help with broad inbox questions, email search, reading/summarizing specific emails, saved triage preferences, and discussion of pending suggestions.

CURRENT SUGGESTIONS:
${suggestionsBlock}

RULES:
- Be concise and helpful
- You are read-only and recommendation-only from chat
- Never claim to archive, delete, send, label, or otherwise mutate the mailbox
- If the user asks for a mailbox-changing action, explain that you can only recommend or revise suggestions here
- Keep responses under 220 words unless the user asks for more detail
- When referring to existing suggestions, use their IDs (from the context above) when calling get_suggestion or set_suggestion

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
- Do NOT use tools for every message — only when saved state or mailbox data would genuinely help the answer`;
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
  systemPrompt: string,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
  toolContext: AgentToolContext,
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

  let response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: compacted,
    tools: CACHED_TOOL_DEFINITIONS,
    cache_control: { type: "ephemeral" },
  });

  let rounds = 0;
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

    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: compacted,
      tools: CACHED_TOOL_DEFINITIONS,
      cache_control: { type: "ephemeral" },
    });
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }

  return {
    assistantText: textBlock.text.trim(),
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
): Promise<ChatResponseWithTools> {
  return runChatWithTools(
    buildGeneralChatSystemPrompt(suggestionsContext),
    chatHistory,
    userMessage,
    apiKey,
    model,
    toolContext,
  );
}


