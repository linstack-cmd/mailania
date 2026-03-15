/**
 * Secret Party client — fetches and decrypts secrets at runtime.
 *
 * Crypto flow (matches https://github.com/0916dhkim/secret-party):
 *   1. Auth via Bearer <publicKeyBase64> (SPKI, derived from PKCS8 private key)
 *   2. GET /api/v1/environments/:id/secrets/:key →
 *        { key, valueEncrypted, dekWrappedByClientPublicKey }
 *   3. Unwrap DEK: RSA-OAEP decrypt dekWrappedByClientPublicKey with private key → DEK (base64)
 *   4. Unwrap secret: AES-256-GCM decrypt valueEncrypted with DEK → plaintext
 *
 * Secret format:  "<ivBase64>;<ciphertextWithTagBase64>"
 * DEK wrapped:    base64-encoded RSA-OAEP ciphertext
 */

import crypto from "crypto";

export interface SecretPartyConfig {
  apiUrl: string;
  environmentId: string;
  privateKeyBase64: string;
}

/** Derive the SPKI public key (base64) from a PKCS8 private key (base64). */
function derivePublicKeyBase64(privateKeyBase64: string): string {
  const privateKeyObj = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const publicKeyDer = crypto
    .createPublicKey(privateKeyObj)
    .export({ format: "der", type: "spki" });
  return Buffer.from(publicKeyDer).toString("base64");
}

/** RSA-OAEP decrypt the wrapped DEK using the API client's private key. */
async function unwrapDek(
  dekWrappedBase64: string,
  privateKeyBase64: string,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(privateKeyBase64, "base64"),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const dekBytes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    Buffer.from(dekWrappedBase64, "base64"),
  );
  return Buffer.from(dekBytes).toString("base64");
}

/**
 * AES-256-GCM decrypt a secret value.
 *
 * @noble/ciphers gcm produces ciphertext||tag (16-byte tag appended).
 * Node.js crypto expects them separated.
 */
function decryptSecretValue(
  valueEncrypted: string,
  dekBase64: string,
): string {
  const [ivB64, ciphertextB64] = valueEncrypted.split(";");
  if (!ivB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted secret format (expected iv;ciphertext)");
  }

  const iv = Buffer.from(ivB64, "base64");
  const combined = Buffer.from(ciphertextB64, "base64");
  const dek = Buffer.from(dekBase64, "base64");

  // Split: everything except last 16 bytes is ciphertext, last 16 is GCM auth tag
  const ciphertext = combined.subarray(0, combined.length - 16);
  const authTag = combined.subarray(combined.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

/**
 * Fetch and decrypt multiple secrets from Secret Party.
 * Returns a map of key → plaintext value for every key that was found.
 * Missing keys are silently skipped (caller falls back to env vars).
 */
export async function fetchSecrets(
  config: SecretPartyConfig,
  keys: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const publicKeyBase64 = derivePublicKeyBase64(config.privateKeyBase64);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${publicKeyBase64}`,
  };

  for (const key of keys) {
    const url = `${config.apiUrl}/api/v1/environments/${config.environmentId}/secrets/${encodeURIComponent(key)}`;

    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 404) {
        console.log(
          `[SecretParty] Secret "${key}" not found — will use env fallback`,
        );
        continue;
      }

      if (!res.ok) {
        console.error(
          `[SecretParty] Failed to fetch "${key}": ${res.status} ${res.statusText}`,
        );
        continue;
      }

      const data = (await res.json()) as {
        key: string;
        valueEncrypted: string;
        dekWrappedByClientPublicKey: string;
      };

      const dek = await unwrapDek(
        data.dekWrappedByClientPublicKey,
        config.privateKeyBase64,
      );
      const value = decryptSecretValue(data.valueEncrypted, dek);
      results.set(key, value);
      console.log(`[SecretParty] Loaded secret "${key}"`);
    } catch (err) {
      console.error(
        `[SecretParty] Error fetching secret "${key}":`,
        (err as Error).message,
      );
    }
  }

  return results;
}
