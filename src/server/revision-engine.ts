/**
 * Suggestion Revision + Chat Engine
 *
 * - generateRevision(): creates a revised suggestion JSON
 * - generateChatResponse(): suggestion-scoped chat
 * - generateGeneralChatResponse(): inbox-level general chat
 *
 * SAFETY: all chat/tool flows are read-only or recommendation-only. No Gmail
 * mutations are executed from here.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TriageSuggestion } from "./triage.js";
import {
  MAILANIA_AGENT_TOOL_DEFINITIONS,
  executeAgentTool,
  type AgentToolContext,
  type ToolTrace,
} from "./agent-tools.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponseWithTools {
  assistantText: string;
  toolTraces: ToolTrace[];
  suggestionUpdatedByTool: boolean;
}

export interface LatestTriageContext {
  runId: string;
  createdAt: string | Date;
  suggestionCount: number;
  suggestions: Array<{
    suggestionIndex: number;
    kind: TriageSuggestion["kind"];
    title: string;
    confidence: TriageSuggestion["confidence"];
    messageCount: number;
  }>;
}

const REVISION_SYSTEM_PROMPT = `You are Mailania's suggestion revision assistant. You are given:
1. An original triage suggestion (JSON)
2. A chat transcript where the user discussed changes to this suggestion

Your job: produce a REVISED suggestion that incorporates the user's feedback.

RULES:
- Output ONLY valid JSON matching the suggestion schema below. No markdown, no extra text.
- You may change any field: kind, title, rationale, confidence, messageIds, filterDraft, questions, actionPlan.
- Allowed "kind" values: "archive_bulk", "create_filter", "needs_user_input", "mark_read"
  - "mark_read": marks messages as read without archiving. Use when the user wants to acknowledge but keep in inbox.
- Keep the suggestion actionable and specific.
- If the user's intent is unclear, set kind to "needs_user_input" and add clarifying questions.
- Preserve messageIds from the original unless the user explicitly asks to change scope.
- Always include a rationale that explains what changed and why.

MULTI-ACTION PLANS:
When the user requests multiple distinct actions (e.g., "archive these AND create a filter AND label the rest"), include an "actionPlan" array. Each step is:
  { "type": "<action_type>", "params": { ... }, "rationale": "why this step" }
Allowed step types: "archive_bulk", "create_filter", "mark_read", "label_messages", "needs_user_input"
- "label_messages" params: { "messageIds": [...], "label": "LabelName" }
- "archive_bulk" params: { "messageIds": [...] }
- "create_filter" params: { "from": "...", "label": "...", "archive": true, ... }
- "mark_read" params: { "messageIds": [...] }
- "needs_user_input" params: { "questions": ["..."] }

Rules for actionPlan:
- Only include actionPlan when the user's intent involves multiple distinct steps.
- For single-action suggestions, omit actionPlan entirely (keep backward-compatible).
- The top-level "kind" should reflect the primary/first action in the plan.
- Steps are ordered — they will be presented and approved sequentially.

SUGGESTION SCHEMA:
{
  "kind": "archive_bulk" | "create_filter" | "needs_user_input" | "mark_read",
  "title": "Short action title",
  "rationale": "Why this action, incorporating user feedback",
  "confidence": "low" | "medium" | "high",
  "messageIds": ["id1", "id2"],
  "filterDraft": { "from": "...", "subjectContains": "...", "hasWords": "...", "label": "...", "archive": true },
  "questions": ["Only if kind is needs_user_input"],
  "actionPlan": [
    { "type": "archive_bulk", "params": { "messageIds": ["id1"] }, "rationale": "Step 1 reason" },
    { "type": "create_filter", "params": { "from": "x@y.com", "label": "L", "archive": true }, "rationale": "Step 2 reason" }
  ]
}

Respond with the JSON object only.`;

function buildSuggestionChatSystemPrompt(original: TriageSuggestion): string {
  return `You are Mailania's triage assistant having a conversation about a specific email suggestion. You help the user refine what action to take.

CONTEXT — Original suggestion:
${JSON.stringify(original, null, 2)}

RULES:
- Be concise and helpful
- If the user wants to change the action (e.g., "just mark as read instead"), acknowledge it clearly
- Explain trade-offs when relevant
- You can suggest alternative actions: archive_bulk, create_filter, needs_user_input, mark_read
- Never execute actions — you only discuss and refine suggestions
- Keep responses under 200 words

TOOL USAGE:
- You have access to exactly these Mailania tools and nothing else:
  1) get_triage_preferences
  2) set_triage_preferences
  3) get_suggestion
  4) set_suggestion
  5) read_email
  6) search_emails
  7) create_suggestion - Create a brand new suggestion and append it to the current triage run
- These tools are recommendation-only. They do NOT apply mailbox actions.
- Use search_emails to answer impact questions ("how many?", "which messages?", "show me examples")
- When reporting counts, cite resultSizeEstimate (approximate total) and include 2-3 sample messages when helpful
- Use read_email when the user asks about a specific message
- Use get_triage_preferences / set_triage_preferences only for durable inbox preferences the user wants remembered
- Use get_suggestion / set_suggestion to inspect or revise Mailania's recommendation itself
- Use create_suggestion when the user asks for a new recommendation to be added (not a modification to the current one)
- Do NOT use tools for every message — only when saved state or mailbox data would genuinely help the answer`;
}

function buildGeneralChatSystemPrompt(latestTriage: LatestTriageContext | null): string {
  return `You are Mailania's inbox assistant having a general conversation about the user's inbox. You help with broad inbox questions, email search, reading/summarizing specific emails, saved triage preferences, and discussion of recent triage suggestions.

LATEST TRIAGE CONTEXT:
${latestTriage ? JSON.stringify(latestTriage, null, 2) : "No triage run is currently available."}

RULES:
- Be concise and helpful
- You are read-only and recommendation-only from chat
- Never claim to archive, delete, send, label, or otherwise mutate the mailbox
- If the user asks for a mailbox-changing action, explain that you can only recommend or revise suggestions here
- Keep responses under 220 words unless the user asks for more detail
- If the user refers to a recent suggestion broadly (for example "the second suggestion"), use the latest triage context above to ground your answer
- If you revise or inspect a specific suggestion from general chat, call get_suggestion or set_suggestion with an explicit runId and suggestionIndex

TOOL USAGE:
- You have access to exactly these Mailania tools and nothing else:
  1) get_triage_preferences
  2) set_triage_preferences
  3) get_suggestion
  4) set_suggestion
  5) read_email
  6) search_emails
  7) create_suggestion - Create a brand new suggestion and append it to the current triage run
- These tools are recommendation-only. They do NOT apply mailbox actions.
- Use search_emails for inbox-wide questions, finding messages, counting matches, or identifying examples
- Use read_email when the user asks to inspect or summarize a specific message
- Use get_triage_preferences / set_triage_preferences only for durable inbox preferences the user wants remembered
- Use get_suggestion / set_suggestion only when discussing a specific triage suggestion
- Use create_suggestion when the user asks for a new recommendation to be added to the current triage run
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
    system: systemPrompt,
    messages: compacted,
    tools: MAILANIA_AGENT_TOOL_DEFINITIONS,
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
      system: systemPrompt,
      messages: compacted,
      tools: MAILANIA_AGENT_TOOL_DEFINITIONS,
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
 * Truncate chat transcript to fit within a character budget.
 * Keeps first and last few exchanges, with a marker in between.
 */
function truncateTranscript(
  chatHistory: ChatMessage[],
  budgetChars: number,
): ChatMessage[] {
  if (chatHistory.length === 0) return [];

  // Serialize to estimate size
  const serialized = chatHistory
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n");

  if (serialized.length <= budgetChars) {
    return chatHistory; // Fits as-is
  }

  // Keep first 2 and last 2 exchanges (pairs of user/assistant)
  const keepFirst = 4; // 2 exchanges = 4 messages minimum
  const keepLast = 4;

  if (chatHistory.length <= keepFirst + keepLast) {
    return chatHistory; // Not enough to truncate meaningfully
  }

  const firstExchanges = chatHistory.slice(0, keepFirst);
  const lastExchanges = chatHistory.slice(-keepLast);

  // Build truncated history with a marker
  const truncated: ChatMessage[] = [
    ...firstExchanges,
    {
      role: "user",
      content:
        "[Earlier conversation omitted for length]",
    },
    {
      role: "assistant",
      content: "Understood, continuing with the recent context.",
    },
    ...lastExchanges,
  ];

  return truncated;
}

/**
 * Generate a revised suggestion based on chat history.
 */
export async function generateRevision(
  original: TriageSuggestion,
  chatHistory: ChatMessage[],
  apiKey: string,
  model: string,
): Promise<TriageSuggestion> {
  const client = new Anthropic({ apiKey });

  // Truncate transcript to fit within 80k token budget (~320k characters @ 4 chars/token)
  const TRANSCRIPT_BUDGET_CHARS = 320000;
  const truncatedHistory = truncateTranscript(chatHistory, TRANSCRIPT_BUDGET_CHARS);

  const userPrompt = `ORIGINAL SUGGESTION:\n${JSON.stringify(original, null, 2)}\n\nCHAT TRANSCRIPT:\n${truncatedHistory
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n")}\n\nProduce the revised suggestion JSON.`;

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: REVISION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM for revision");
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const revised = JSON.parse(jsonText) as TriageSuggestion;

  const validKinds = new Set(["archive_bulk", "create_filter", "needs_user_input", "mark_read"]);
  const validConfidences = new Set(["low", "medium", "high"]);

  if (!validKinds.has(revised.kind)) revised.kind = original.kind;
  if (!validConfidences.has(revised.confidence)) revised.confidence = original.confidence;
  if (!revised.title) revised.title = original.title;
  if (!revised.rationale) revised.rationale = original.rationale;

  if (revised.actionPlan) {
    const validStepTypes = new Set([
      "archive_bulk",
      "create_filter",
      "needs_user_input",
      "mark_read",
      "label_messages",
    ]);

    if (!Array.isArray(revised.actionPlan) || revised.actionPlan.length === 0) {
      delete revised.actionPlan;
    } else {
      revised.actionPlan = revised.actionPlan.filter(
        (step) =>
          step &&
          typeof step === "object" &&
          validStepTypes.has(step.type) &&
          step.params &&
          typeof step.params === "object",
      );
      if (revised.actionPlan.length === 0) {
        delete revised.actionPlan;
      }
    }
  }

  return revised;
}

/**
 * Suggestion-scoped chat.
 */
export async function generateChatResponse(
  original: TriageSuggestion,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
  toolContext: AgentToolContext,
): Promise<ChatResponseWithTools> {
  return runChatWithTools(
    buildSuggestionChatSystemPrompt(original),
    chatHistory,
    userMessage,
    apiKey,
    model,
    toolContext,
  );
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
  latestTriage: LatestTriageContext | null,
): Promise<ChatResponseWithTools> {
  return runChatWithTools(
    buildGeneralChatSystemPrompt(latestTriage),
    chatHistory,
    userMessage,
    apiKey,
    model,
    toolContext,
  );
}

/**
 * Legacy wrapper for backward compatibility (without tool-calling).
 */
export async function generateChatResponseSimple(
  original: TriageSuggestion,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const result = await generateChatResponse(original, chatHistory, userMessage, apiKey, model, {
    userId: "legacy-wrapper",
    auth: null,
    localDev: true,
  });
  return result.assistantText;
}
