import Anthropic from "@anthropic-ai/sdk";
import type pg from "pg";
import type { ChatMessage } from "./revision-engine.js";

export interface StoredChatMessage extends ChatMessage {
  id: string;
  createdAt: string;
}

const MODEL_CONTEXT_LIMIT = 200_000;
const COMPACTION_TRIGGER_RATIO = 0.7;
const COMPACTION_TRIGGER_TOKENS = Math.floor(
  MODEL_CONTEXT_LIMIT * COMPACTION_TRIGGER_RATIO,
);
const KEEP_RECENT_MESSAGES = 12;

const SUMMARY_PREFIX = "[Auto-generated conversation summary]";

const COMPACTION_SYSTEM_PROMPT = `You are compressing an older portion of an email-management conversation into a durable working summary.

Preserve only context that future turns need:
- decisions already made
- user preferences and constraints
- work completed or verified
- unresolved questions or next steps
- important entities still in play, including senders, message IDs, labels, filters, ticket IDs, or links

Do not preserve filler, repeated wording, or transient back-and-forth that no longer matters.
Keep the summary concise and structured for future assistant turns.`;

function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
    .join("\n\n");
}

function chooseSplitIndex(history: StoredChatMessage[]): number {
  if (history.length <= KEEP_RECENT_MESSAGES) return 0;

  let splitIndex = history.length - KEEP_RECENT_MESSAGES;
  if (history[splitIndex]?.role === "assistant" && splitIndex > 0) {
    splitIndex -= 1;
  }

  return Math.max(1, splitIndex);
}

export function isCompactionSummaryMessage(message: ChatMessage): boolean {
  return message.content.startsWith(SUMMARY_PREFIX);
}

export function getActivePromptHistory(
  history: StoredChatMessage[],
): StoredChatMessage[] {
  let latestSummaryIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (isCompactionSummaryMessage(history[i])) {
      latestSummaryIndex = i;
      break;
    }
  }

  return latestSummaryIndex >= 0 ? history.slice(latestSummaryIndex) : history;
}

async function generateConversationSummary(
  client: Anthropic,
  olderMessages: StoredChatMessage[],
  model: string,
  summaryContext?: string,
): Promise<string> {
  const transcript = formatTranscript(olderMessages);
  const contextBlock = summaryContext?.trim()
    ? `CONTEXT:\n${summaryContext.trim()}\n\n`
    : "";

  const response = await client.messages.create({
    model,
    max_tokens: 900,
    system: COMPACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contextBlock}OLDER CONVERSATION TO SUMMARIZE:\n${transcript}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM for compaction summary");
  }

  return `${SUMMARY_PREFIX}\n\n${textBlock.text.trim()}`;
}

async function insertSummaryCheckpoint(
  pool: pg.Pool,
  conversationId: string,
  recentMessages: StoredChatMessage[],
  summary: string,
): Promise<StoredChatMessage[]> {
  const tailTimestamp = recentMessages[0]
    ? new Date(new Date(recentMessages[0].createdAt).getTime() - 1000)
    : new Date();

  const inserted = await pool.query(
    `INSERT INTO "suggestion_message" ("conversation_id", "role", "content", "created_at")
     VALUES ($1, 'assistant', $2, $3)
     RETURNING "id", "role", "content", "created_at"`,
    [conversationId, summary, tailTimestamp.toISOString()],
  );

  const summaryMessage = inserted.rows[0];

  return [
    {
      id: summaryMessage.id,
      role: summaryMessage.role,
      content: summaryMessage.content,
      createdAt: summaryMessage.created_at,
    },
    ...recentMessages,
  ];
}

export async function maybeCompactConversation(args: {
  pool: pg.Pool;
  conversationId: string;
  history: StoredChatMessage[];
  pendingMessages: ChatMessage[];
  apiKey: string;
  model: string;
  summaryContext?: string;
  estimatePromptTokens: (
    history: ChatMessage[],
    pendingMessages: ChatMessage[],
  ) => Promise<number>;
}): Promise<StoredChatMessage[]> {
  const activeHistory = getActivePromptHistory(args.history);

  if (activeHistory.length <= KEEP_RECENT_MESSAGES) {
    return activeHistory;
  }

  const estimatedTokens = await args.estimatePromptTokens(
    activeHistory,
    args.pendingMessages,
  );

  if (estimatedTokens < COMPACTION_TRIGGER_TOKENS) {
    return activeHistory;
  }

  const splitIndex = chooseSplitIndex(activeHistory);
  if (splitIndex <= 0 || splitIndex >= activeHistory.length) {
    return activeHistory;
  }

  const olderMessages = activeHistory.slice(0, splitIndex);
  const recentMessages = activeHistory.slice(splitIndex);
  const client = new Anthropic({ apiKey: args.apiKey });

  try {
    const summary = await generateConversationSummary(
      client,
      olderMessages,
      args.model,
      args.summaryContext,
    );

    const compactedHistory = await insertSummaryCheckpoint(
      args.pool,
      args.conversationId,
      recentMessages,
      summary,
    );

    console.info(
      `[Chat] Compacted conversation ${args.conversationId} at ~${estimatedTokens} prompt tokens`,
    );

    return compactedHistory;
  } catch (err) {
    console.error("[Chat] Conversation compaction failed:", err);
    return activeHistory;
  }
}
