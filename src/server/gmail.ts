import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead?: boolean;
  labelIds?: string[];
}

export interface GmailFullMessage extends InboxMessage {
  body?: string;
  to?: string;
  cc?: string;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function listInbox(
  auth: OAuth2Client,
  maxResults: number = 25
): Promise<InboxMessage[]> {
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
  });

  const messages = res.data.messages ?? [];

  const details = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = detail.data.payload?.headers;

      const labelIds = detail.data.labelIds ?? [];
      return {
        id: msg.id!,
        subject: getHeader(headers, "Subject") || "(no subject)",
        from: getHeader(headers, "From"),
        date: getHeader(headers, "Date"),
        snippet: detail.data.snippet ?? "",
        isRead: !labelIds.includes("UNREAD"),
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      };
    })
  );

  return details;
}

/**
 * List only unread inbox messages (up to maxResults).
 * Uses Gmail query `is:unread` with INBOX label.
 */
export async function listUnreadInbox(
  auth: OAuth2Client,
  maxResults: number = 100
): Promise<InboxMessage[]> {
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
    q: "is:unread",
  });

  const messages = res.data.messages ?? [];

  const details = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = detail.data.payload?.headers;
      const labelIds = detail.data.labelIds ?? [];

      return {
        id: msg.id!,
        subject: getHeader(headers, "Subject") || "(no subject)",
        from: getHeader(headers, "From"),
        date: getHeader(headers, "Date"),
        snippet: detail.data.snippet ?? "",
        isRead: false, // All results are unread by definition
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      };
    })
  );

  return details;
}

/**
 * Get a single message by ID with full metadata.
 */
export async function getMessage(
  auth: OAuth2Client,
  messageId: string,
): Promise<GmailFullMessage> {
  const gmail = google.gmail({ version: "v1", auth });

  const detail = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "To", "Cc", "Date"],
  });

  const headers = detail.data.payload?.headers;

  return {
    id: detail.data.id!,
    subject: getHeader(headers, "Subject") || "(no subject)",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To") || undefined,
    cc: getHeader(headers, "Cc") || undefined,
    date: getHeader(headers, "Date"),
    snippet: detail.data.snippet ?? "",
    labelIds: detail.data.labelIds ?? undefined,
  };
}

export interface SearchMessagesResult {
  messages: InboxMessage[];
  count: number;
  resultSizeEstimate: number | null;
}

/**
 * Search messages with a Gmail query string.
 * Returns messages along with count (page length) and Gmail's resultSizeEstimate.
 */
export async function searchMessages(
  auth: OAuth2Client,
  query: string,
  maxResults: number = 25,
): Promise<SearchMessagesResult> {
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = res.data.messages ?? [];
  const resultSizeEstimate = res.data.resultSizeEstimate ?? null;

  const details = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = detail.data.payload?.headers;

      return {
        id: msg.id!,
        subject: getHeader(headers, "Subject") || "(no subject)",
        from: getHeader(headers, "From"),
        date: getHeader(headers, "Date"),
        snippet: detail.data.snippet ?? "",
        labelIds: detail.data.labelIds ?? undefined,
      };
    }),
  );

  return {
    messages: details,
    count: details.length,
    resultSizeEstimate,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 mutation functions (require approval token validation at call site)
// ---------------------------------------------------------------------------

/**
 * Archive messages by removing the INBOX label.
 */
export async function archiveMessages(
  auth: OAuth2Client,
  messageIds: string[],
): Promise<{ archived: string[]; errors: Array<{ id: string; error: string }> }> {
  const gmail = google.gmail({ version: "v1", auth });
  const archived: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of messageIds) {
    try {
      await gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { removeLabelIds: ["INBOX"] },
      });
      archived.push(id);
    } catch (err: any) {
      errors.push({ id, error: err.message ?? String(err) });
    }
  }

  return { archived, errors };
}

/**
 * Unarchive messages by adding back the INBOX label.
 */
export async function unarchiveMessages(
  auth: OAuth2Client,
  messageIds: string[],
): Promise<{ unarchived: string[]; errors: Array<{ id: string; error: string }> }> {
  const gmail = google.gmail({ version: "v1", auth });
  const unarchived: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of messageIds) {
    try {
      await gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: ["INBOX"] },
      });
      unarchived.push(id);
    } catch (err: any) {
      errors.push({ id, error: err.message ?? String(err) });
    }
  }

  return { unarchived, errors };
}

/**
 * Apply a label to messages. Creates the label if it doesn't exist.
 */
export async function labelMessages(
  auth: OAuth2Client,
  messageIds: string[],
  labelName: string,
): Promise<{ labeled: string[]; labelId: string; errors: Array<{ id: string; error: string }> }> {
  const gmail = google.gmail({ version: "v1", auth });

  // Find or create label
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  let label = labelsRes.data.labels?.find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase(),
  );

  if (!label) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    label = created.data;
  }

  const labelId = label.id!;
  const labeled: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of messageIds) {
    try {
      await gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: [labelId] },
      });
      labeled.push(id);
    } catch (err: any) {
      errors.push({ id, error: err.message ?? String(err) });
    }
  }

  return { labeled, labelId, errors };
}

/**
 * Create a Gmail filter.
 */
export interface FilterRule {
  from?: string;
  to?: string;
  subject?: string;
  hasTheWord?: string;
  label?: string;
  archive?: boolean;
  markRead?: boolean;
}

export async function createGmailFilter(
  auth: OAuth2Client,
  rule: FilterRule,
): Promise<{ filterId: string }> {
  const gmail = google.gmail({ version: "v1", auth });

  // Resolve label name to ID if specified
  let labelId: string | undefined;
  if (rule.label) {
    const labelsRes = await gmail.users.labels.list({ userId: "me" });
    let label = labelsRes.data.labels?.find(
      (l) => l.name?.toLowerCase() === rule.label!.toLowerCase(),
    );
    if (!label) {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: rule.label,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      label = created.data;
    }
    labelId = label.id!;
  }

  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];

  if (labelId) addLabelIds.push(labelId);
  if (rule.archive) removeLabelIds.push("INBOX");
  if (rule.markRead) removeLabelIds.push("UNREAD");

  const filter = await gmail.users.settings.filters.create({
    userId: "me",
    requestBody: {
      criteria: {
        from: rule.from,
        to: rule.to,
        subject: rule.subject,
        query: rule.hasTheWord,
      },
      action: {
        addLabelIds: addLabelIds.length > 0 ? addLabelIds : undefined,
        removeLabelIds: removeLabelIds.length > 0 ? removeLabelIds : undefined,
      },
    },
  });

  return { filterId: filter.data.id! };
}
