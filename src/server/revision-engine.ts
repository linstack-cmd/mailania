/**
 * Suggestion Revision Engine — v1
 *
 * Takes an original suggestion, the chat transcript, and produces a revised
 * suggestion. The revision may change the action kind (e.g., archive_bulk →
 * mark_read) based on user intent expressed in chat.
 *
 * SAFETY: This module is read-only. It produces suggestion JSON but never
 * executes any Gmail mutations.
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

  const userPrompt = `ORIGINAL SUGGESTION:\n${JSON.stringify(original, null, 2)}\n\nCHAT TRANSCRIPT:\n${chatHistory
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n")}\n\nProduce the revised suggestion JSON.`;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: REVISION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM for revision");
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  const revised = JSON.parse(jsonText) as TriageSuggestion;

  // Validate core fields
  const validKinds = new Set([
    "archive_bulk",
    "create_filter",
    "needs_user_input",
    "mark_read",
  ]);
  const validConfidences = new Set(["low", "medium", "high"]);

  if (!validKinds.has(revised.kind)) revised.kind = original.kind;
  if (!validConfidences.has(revised.confidence))
    revised.confidence = original.confidence;
  if (!revised.title) revised.title = original.title;
  if (!revised.rationale) revised.rationale = original.rationale;

  // Validate actionPlan if present
  if (revised.actionPlan) {
    const validStepTypes = new Set([
      "archive_bulk",
      "create_filter",
      "needs_user_input",
      "mark_read",
      "label_messages",
    ]);

    if (!Array.isArray(revised.actionPlan) || revised.actionPlan.length === 0) {
      // Invalid actionPlan — remove it to fall back to single-action
      delete revised.actionPlan;
    } else {
      // Filter out invalid steps, keep valid ones
      revised.actionPlan = revised.actionPlan.filter(
        (step) =>
          step &&
          typeof step === "object" &&
          validStepTypes.has(step.type) &&
          step.params &&
          typeof step.params === "object",
      );
      // If all steps were invalid, remove actionPlan
      if (revised.actionPlan.length === 0) {
        delete revised.actionPlan;
      }
    }
  }

  return revised;
}

/**
 * Generate an assistant chat response to the user's message about a suggestion.
 *
 * Supports tool-calling via Mailania's strict allowlisted agent tool registry.
 * The tool-calling loop runs server-side with a safety cap of MAX_TOOL_ROUNDS
 * iterations and never exposes mailbox mutation powers.
 */
export async function generateChatResponse(
  original: TriageSuggestion,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
  toolContext: AgentToolContext,
): Promise<ChatResponseWithTools> {
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are Mailania's triage assistant having a conversation about a specific email suggestion. You help the user refine what action to take.

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
- These tools are recommendation-only. They do NOT apply mailbox actions.
- Use search_emails to answer impact questions ("how many?", "which messages?", "show me examples")
- When reporting counts, cite resultSizeEstimate (approximate total) and include 2-3 sample messages when helpful
- Use read_email when the user asks about a specific message
- Use get_triage_preferences / set_triage_preferences only for durable inbox preferences the user wants remembered
- Use get_suggestion / set_suggestion to inspect or revise Mailania's recommendation itself
- Do NOT use tools for every message — only when saved state or mailbox data would genuinely help the answer`;

  const messages: Anthropic.MessageParam[] = [];
  for (const m of chatHistory) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  const MAX_TOOL_ROUNDS = 5;
  const toolTraces: ToolTrace[] = [];

  let response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
    tools: MAILANIA_AGENT_TOOL_DEFINITIONS,
  });

  // Tool-calling loop: model may request tool calls, we execute and feed back
  let rounds = 0;
  while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    // Collect all tool_use blocks from the response
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) break;

    // Add the assistant's response (with tool_use blocks) to messages
    messages.push({
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

    // Execute each tool and build tool_result blocks
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolBlock of toolUseBlocks) {
      // We know these are tool_use blocks
      const tb = toolBlock as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
      try {
        const execResult = await executeAgentTool(
          toolContext,
          tb.name,
          tb.input,
        );
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

    // Add tool results to messages and request next response
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: MAILANIA_AGENT_TOOL_DEFINITIONS,
    });
  }

  // Extract final text response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }

  return {
    assistantText: textBlock.text.trim(),
    toolTraces,
    suggestionUpdatedByTool: toolTraces.some(
      (trace) => trace.toolName === "set_suggestion" && !trace.resultSummary.startsWith("error:"),
    ),
  };
}

/**
 * Legacy wrapper for backward compatibility (without tool-calling).
 * Used only if you need the plain string response.
 */
export async function generateChatResponseSimple(
  original: TriageSuggestion,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const result = await generateChatResponse(
    original,
    chatHistory,
    userMessage,
    apiKey,
    model,
    {
      userId: "legacy-wrapper",
      auth: null,
      localDev: true,
    },
  );
  return result.assistantText;
}
