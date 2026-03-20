/**
 * Client-side passkey (WebAuthn) helpers.
 *
 * Uses @simplewebauthn/browser for the browser-side ceremony.
 */

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

/**
 * Register a new passkey for the currently logged-in user.
 * Returns true on success, throws on failure.
 */
export async function registerPasskey(): Promise<boolean> {
  // Step 1: Get registration options from server
  const optionsRes = await fetch("/auth/passkey/register-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get registration options");
  }

  const options = await optionsRes.json();

  // Step 2: Start browser-side registration ceremony
  const credential = await startRegistration({ optionsJSON: options });

  // Step 3: Send credential to server for verification
  const verifyRes = await fetch("/auth/passkey/register-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credential),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || "Registration verification failed");
  }

  const result = await verifyRes.json();
  return result.verified === true;
}

/**
 * Login with an existing passkey.
 * Returns the user info on success, throws on failure.
 */
export async function loginWithPasskey(): Promise<{
  verified: boolean;
  user: { id: string; displayName: string; email: string };
}> {
  // Step 1: Get authentication options from server
  const optionsRes = await fetch("/auth/passkey/login-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get login options");
  }

  const options = await optionsRes.json();

  // Step 2: Start browser-side authentication ceremony
  const credential = await startAuthentication({ optionsJSON: options });

  // Step 3: Send credential to server for verification
  const verifyRes = await fetch("/auth/passkey/login-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credential),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || "Authentication failed");
  }

  return verifyRes.json();
}

/**
 * Check if the browser supports WebAuthn/passkeys.
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}
