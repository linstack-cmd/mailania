export interface GmailAuthFailure {
  status: number;
  code: "GMAIL_RECONNECT_REQUIRED";
  error: string;
  detail?: string;
}

/**
 * Normalize Google OAuth/Gmail auth failures that should prompt the user to reconnect Gmail.
 *
 * The live Mailania inbox failure was a 400 invalid_grant from Google's token endpoint,
 * which means the refresh token expired or was revoked. Google does not return this as 401.
 */
export function getGmailAuthFailure(err: any): GmailAuthFailure | null {
  const status = Number(err?.code ?? err?.response?.status ?? err?.status);
  const responseData = err?.response?.data;
  const oauthError = typeof responseData?.error === "string" ? responseData.error : null;
  const oauthDescription =
    typeof responseData?.error_description === "string"
      ? responseData.error_description
      : null;
  const message = typeof err?.message === "string" ? err.message : "";

  if (status === 400 && oauthError === "invalid_grant") {
    return {
      status: 401,
      code: "GMAIL_RECONNECT_REQUIRED",
      error: "Gmail access expired or was revoked — please reconnect Gmail.",
      detail: oauthDescription ?? (message || undefined),
    };
  }

  if (status === 401) {
    return {
      status: 401,
      code: "GMAIL_RECONNECT_REQUIRED",
      error: "Gmail access expired — please reconnect Gmail.",
      detail: oauthDescription ?? (message || undefined),
    };
  }

  return null;
}
