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

/**
 * A single step in a multi-action plan.
 * Each step describes one discrete action the agent recommends.
 */
export interface ActionPlanStep {
  type: SuggestionKind | "label_messages";
  params: Record<string, unknown>;
  rationale?: string;
}

export interface TriageSuggestion {
  kind: SuggestionKind;
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  messageIds?: string[];
  filterDraft?: FilterDraft;
  questions?: string[];
  /**
   * Multi-action plan (optional). When present, describes an ordered sequence
   * of actions the agent recommends. The top-level `kind` reflects the primary
   * action; `actionPlan` provides the full breakdown.
   *
   * Backward-compatible: older clients that don't read this field still see
   * a valid single-action suggestion via the top-level fields.
   */
  actionPlan?: ActionPlanStep[];
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

function parseLLMResponse(text: string): TriageSuggestion[] {
  let jsonText = text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(jsonText) as TriageResult;

  if (!Array.isArray(parsed.suggestions)) {
    throw new Error("LLM response missing 'suggestions' array");
  }

  const validKinds = new Set(["archive_bulk", "create_filter", "needs_user_input", "mark_read"]);
  const validConfidences = new Set(["low", "medium", "high"]);

  return parsed.suggestions.filter((s) => {
    return (
      validKinds.has(s.kind) &&
      typeof s.title === "string" &&
      typeof s.rationale === "string" &&
      validConfidences.has(s.confidence)
    );
  });
}

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

  return { suggestions: parseLLMResponse(textBlock.text) };
}

// ---------------------------------------------------------------------------
// Batch size for splitting large message sets into LLM-friendly chunks
// ---------------------------------------------------------------------------
const BATCH_SIZE = 30;

export interface TriageProgressEvent {
  type: "progress" | "batch_done" | "complete" | "error";
  /** Current stage description */
  stage?: string;
  /** 0–100 */
  percent?: number;
  /** Total messages being triaged */
  totalMessages?: number;
  /** Number of batches */
  totalBatches?: number;
  /** Current batch (1-indexed) */
  currentBatch?: number;
  /** Suggestions generated so far */
  suggestionsCount?: number;
  /** All suggestions (only on "complete") */
  suggestions?: TriageSuggestion[];
  /** Error message (only on "error") */
  error?: string;
}

/**
 * Generate triage suggestions with streaming progress events.
 * Splits large message sets into batches and calls the LLM for each.
 *
 * @param onProgress Called with progress events as they happen.
 */
export async function generateTriageSuggestionsStreaming(
  messages: InboxMessage[],
  apiKey: string,
  model: string,
  onProgress: (event: TriageProgressEvent) => void,
): Promise<TriageResult> {
  if (messages.length === 0) {
    onProgress({ type: "complete", percent: 100, totalMessages: 0, suggestionsCount: 0, suggestions: [] });
    return { suggestions: [] };
  }

  const client = new Anthropic({ apiKey });
  const totalBatches = Math.ceil(messages.length / BATCH_SIZE);
  const allSuggestions: TriageSuggestion[] = [];

  onProgress({
    type: "progress",
    stage: `Generating suggestions for ${messages.length} message${messages.length !== 1 ? "s" : ""}…`,
    percent: 5,
    totalMessages: messages.length,
    totalBatches,
    currentBatch: 0,
    suggestionsCount: 0,
  });

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * BATCH_SIZE;
    const batchMessages = messages.slice(start, start + BATCH_SIZE);
    const batchNum = batchIdx + 1;

    // Progress: starting batch
    const batchStartPercent = 5 + ((batchIdx / totalBatches) * 90);
    onProgress({
      type: "progress",
      stage: totalBatches > 1
        ? `Analyzing batch ${batchNum}/${totalBatches} (${batchMessages.length} messages)…`
        : `Analyzing ${batchMessages.length} message${batchMessages.length !== 1 ? "s" : ""}…`,
      percent: Math.round(batchStartPercent),
      totalMessages: messages.length,
      totalBatches,
      currentBatch: batchNum,
      suggestionsCount: allSuggestions.length,
    });

    const inboxSummary = batchMessages
      .map(
        (m, i) =>
          `[${start + i + 1}] id=${m.id} | from=${m.from} | subject=${m.subject} | date=${m.date} | snippet=${m.snippet}`,
      )
      .join("\n");

    const userMessage = totalBatches > 1
      ? `Here are messages ${start + 1}–${start + batchMessages.length} of ${messages.length} from the user's unread Gmail inbox. Analyze them and suggest triage actions.\n\n${inboxSummary}`
      : `Here are ${messages.length} unread messages from the user's Gmail inbox. Analyze them and suggest triage actions.\n\n${inboxSummary}`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from LLM");
      }

      const batchSuggestions = parseLLMResponse(textBlock.text);
      allSuggestions.push(...batchSuggestions);

      const batchEndPercent = 5 + (((batchIdx + 1) / totalBatches) * 90);
      onProgress({
        type: "batch_done",
        stage: totalBatches > 1
          ? `Batch ${batchNum}/${totalBatches} done — ${batchSuggestions.length} suggestion${batchSuggestions.length !== 1 ? "s" : ""}`
          : `Generated ${batchSuggestions.length} suggestion${batchSuggestions.length !== 1 ? "s" : ""}`,
        percent: Math.round(batchEndPercent),
        totalMessages: messages.length,
        totalBatches,
        currentBatch: batchNum,
        suggestionsCount: allSuggestions.length,
      });
    } catch (err: any) {
      onProgress({
        type: "error",
        error: `Batch ${batchNum} failed: ${err.message || String(err)}`,
        currentBatch: batchNum,
        totalBatches,
        suggestionsCount: allSuggestions.length,
      });
      // Continue with other batches if possible
    }
  }

  onProgress({
    type: "complete",
    stage: "Done",
    percent: 100,
    totalMessages: messages.length,
    totalBatches,
    suggestionsCount: allSuggestions.length,
    suggestions: allSuggestions,
  });

  return { suggestions: allSuggestions };
}
