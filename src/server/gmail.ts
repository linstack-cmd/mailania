import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
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

      return {
        id: msg.id!,
        subject: getHeader(headers, "Subject") || "(no subject)",
        from: getHeader(headers, "From"),
        date: getHeader(headers, "Date"),
        snippet: detail.data.snippet ?? "",
      };
    })
  );

  return details;
}
