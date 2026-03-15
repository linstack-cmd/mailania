import { google } from "googleapis";
import fs from "fs";
import path from "path";

const TOKEN_PATH = path.resolve("token.json");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCode(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return client;
}

export function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    return client;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return fs.existsSync(TOKEN_PATH);
}

export function logout(): void {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
}
