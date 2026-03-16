/**
 * AI Triage Suggestions — powered by Anthropic Claude.
 *
 * SAFETY CONTRACT:
 *   This module is strictly READ-ONLY. It generates suggestions for the user
 *   to review. It NEVER performs Gmail mutations (archive, delete, label,
 *   filter creation, or any write operation). All actions require explicit
 *   user approval through the collaboration UI.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { InboxMessage } from "./gmail.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterDraft {
  from?: string;
  subjectContains?: string;
  hasWords?: string;
  label?: string;
  archive?: boolean;
}

/**
 * Suggestion kind union.
 *
 * "mark_read" was added in v1 chat-revision to allow the agent to recommend
 * marking messages as read instead of archiving. It is non-destructive and
 * backward-compatible: older clients that don't recognise the kind will
 * treat the suggestion as informational (same as needs_user_input).
 */
export type SuggestionKind =
  | "archive_bulk"
  | "create_filter"
  | "needs_user_input"
  | "mark_read";

export interface TriageSuggestion {
  kind: SuggestionKind;
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  messageIds?: string[];
  filterDraft?: FilterDraft;
  questions?: string[];
}

export interface TriageResult {
  suggestions: TriageSuggestion[];
}

// ---------------------------------------------------------------------------
// System prompt — encodes the safety policy
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Mailania's triage assistant. Your job is to analyze a user's Gmail inbox messages and suggest organizational actions.

SAFETY RULES (non-negotiable):
- You ONLY suggest actions. You NEVER execute them.
- You cannot archive, delete, label, or create filters. You can only recommend.
- Every suggestion must include a clear rationale so the user can make an informed decision.
- When you are unsure about the user's intent, use "needs_user_input" and ask clarifying questions.
- Prefer fewer high-quality suggestions over many low-confidence ones.

OUTPUT FORMAT:
Respond with valid JSON matching this schema (no markdown fences, no extra text):

{
  "suggestions": [
    {
      "kind": "archive_bulk" | "create_filter" | "needs_user_input",
      "title": "Short action title",
      "rationale": "Why this is suggested, with enough context to decide",
      "confidence": "low" | "medium" | "high",
      "messageIds": ["id1", "id2"],
      "filterDraft": {
        "from": "sender@example.com",
        "subjectContains": "optional pattern",
        "hasWords": "optional keyword match",
        "label": "optional label to apply",
        "archive": true
      },
      "questions": ["Question for the user if kind is needs_user_input"]
    }
  ]
}

GUIDELINES:
- "archive_bulk": Group related messages that look safe to archive (newsletters, notifications, automated alerts). Always include messageIds.
- "create_filter": When you see a recurring pattern (same sender, same subject prefix), suggest a filter. Always include filterDraft.
- "needs_user_input": When the right action is ambiguous or the messages might be important. Always include questions.
- Keep suggestions actionable and specific. Reference actual senders and subjects from the inbox.
- Do not suggest archiving messages that look like personal correspondence, action items, or time-sensitive content.`;

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Generate triage suggestions for a list of inbox messages.
 *
 * This function is read-only: it sends message metadata to the LLM and
 * returns structured suggestions. It never touches the Gmail API.
 */
export async function generateTriageSuggestions(
  messages: InboxMessage[],
  apiKey: string,
  model: string,
): Promise<TriageResult> {
  if (messages.length === 0) {
    return { suggestions: [] };
  }

  const client = new Anthropic({ apiKey });

  // Build a compact representation of the inbox for the prompt
  const inboxSummary = messages
    .map(
      (m, i) =>
        `[${i + 1}] id=${m.id} | from=${m.from} | subject=${m.subject} | date=${m.date} | snippet=${m.snippet}`,
    )
    .join("\n");

  const userMessage = `Here are ${messages.length} messages from the user's Gmail inbox. Analyze them and suggest triage actions.\n\n${inboxSummary}`;

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }

  // Parse JSON response — strip markdown fences if the model wraps them
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(jsonText) as TriageResult;

  // Validate structure minimally
  if (!Array.isArray(parsed.suggestions)) {
    throw new Error("LLM response missing 'suggestions' array");
  }

  // Sanitize: ensure every suggestion has required fields
  const validKinds = new Set(["archive_bulk", "create_filter", "needs_user_input", "mark_read"]);
  const validConfidences = new Set(["low", "medium", "high"]);

  parsed.suggestions = parsed.suggestions.filter((s) => {
    return (
      validKinds.has(s.kind) &&
      typeof s.title === "string" &&
      typeof s.rationale === "string" &&
      validConfidences.has(s.confidence)
    );
  });

  return parsed;
}
