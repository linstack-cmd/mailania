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

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const REVISION_SYSTEM_PROMPT = `You are Mailania's suggestion revision assistant. You are given:
1. An original triage suggestion (JSON)
2. A chat transcript where the user discussed changes to this suggestion

Your job: produce a REVISED suggestion that incorporates the user's feedback.

RULES:
- Output ONLY valid JSON matching the suggestion schema below. No markdown, no extra text.
- You may change any field: kind, title, rationale, confidence, messageIds, filterDraft, questions.
- Allowed "kind" values: "archive_bulk", "create_filter", "needs_user_input", "mark_read"
  - "mark_read": marks messages as read without archiving. Use when the user wants to acknowledge but keep in inbox.
- Keep the suggestion actionable and specific.
- If the user's intent is unclear, set kind to "needs_user_input" and add clarifying questions.
- Preserve messageIds from the original unless the user explicitly asks to change scope.
- Always include a rationale that explains what changed and why.

SUGGESTION SCHEMA:
{
  "kind": "archive_bulk" | "create_filter" | "needs_user_input" | "mark_read",
  "title": "Short action title",
  "rationale": "Why this action, incorporating user feedback",
  "confidence": "low" | "medium" | "high",
  "messageIds": ["id1", "id2"],
  "filterDraft": { "from": "...", "subjectContains": "...", "hasWords": "...", "label": "...", "archive": true },
  "questions": ["Only if kind is needs_user_input"]
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

  // Validate
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

  return revised;
}

/**
 * Generate an assistant chat response to the user's message about a suggestion.
 */
export async function generateChatResponse(
  original: TriageSuggestion,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<string> {
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
- Keep responses under 200 words`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of chatHistory) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }

  return textBlock.text.trim();
}
