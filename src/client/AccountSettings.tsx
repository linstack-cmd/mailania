/**
 * Account Settings page.
 *
 * Manage: user profile, linked Gmail accounts, passkey credentials.
 */

import { useState } from "react";
import { css } from "@flow-css/core/css";
import { registerPasskey, isPasskeySupported } from "./passkey";

interface GmailAccountInfo {
  id: string;
  email: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface UserInfo {
  id: string;
  displayName: string;
  email: string | null;
}

interface StatusData {
  authenticated: boolean;
  localDev?: boolean;
  user?: UserInfo | null;
  gmailAccounts?: GmailAccountInfo[];
  gmailConnected?: boolean;
  hasPasskey?: boolean;
  activeGmailAccountId?: string;
}

const gmailAccountRowClass = css((t) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  background: t.colors.bgAlt,
  border: `1px solid ${t.colors.borderLight}`,
  borderRadius: t.radiusSm,
  fontSize: "0.88rem",
}));

export default function AccountSettings({
  status,
  onBack,
  onStatusChange,
}: {
  status: StatusData | null;
  onBack: () => void;
  onStatusChange: () => void;
}) {
  const [passkeyRegistering, setPasskeyRegistering] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  async function handleRegisterPasskey() {
    setPasskeyRegistering(true);
    setPasskeyError(null);
    setPasskeyMsg(null);
    try {
      await registerPasskey();
      setPasskeyMsg("✅ Passkey registered successfully!");
      onStatusChange();
    } catch (err: any) {
      setPasskeyError(err.message || "Failed to register passkey");
    } finally {
      setPasskeyRegistering(false);
    }
  }

  async function handleSwitchGmail(gmailAccountId: string) {
    try {
      const res = await fetch("/api/account/switch-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmailAccountId }),
      });
      if (res.ok) {
        onStatusChange();
      }
    } catch { /* ignore */ }
  }

  async function handleUnlinkGmail(gmailAccountId: string) {
    if (!confirm("Remove this Gmail account? You can re-add it later.")) return;
    setUnlinkingId(gmailAccountId);
    try {
      const res = await fetch("/api/account/unlink-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmailAccountId }),
      });
      if (res.ok) {
        onStatusChange();
      }
    } catch { /* ignore */ }
    setUnlinkingId(null);
  }

  return (
    <div className={css((t) => ({ maxWidth: "600px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(5)}` }))}>
      <button
        onClick={onBack}
        className={css((t) => ({
          display: "inline-flex",
          alignItems: "center",
          gap: t.spacing(1),
          padding: `${t.spacing(2)} ${t.spacing(3)}`,
          border: `1px solid ${t.colors.border}`,
          borderRadius: t.radiusSm,
          background: t.colors.bg,
          cursor: "pointer",
          fontSize: "0.85rem",
          color: t.colors.text,
          marginBottom: t.spacing(5),
          "&:hover": { background: t.colors.bgAlt, borderColor: t.colors.primary },
        }))}
      >
        ← Back
      </button>

      <h1 className={css((t) => ({ fontSize: "1.4rem", fontWeight: "700", marginBottom: t.spacing(6) }))}>
        ⚙️ Account Settings
      </h1>

      {/* User info */}
      {status?.user && (
        <Section title="Profile">
          <div className={css((t) => ({ fontSize: "0.92rem", lineHeight: "1.7" }))}>
            <div><strong>Name:</strong> {status.user.displayName}</div>
            {status.user.email && <div><strong>Email:</strong> {status.user.email}</div>}
            <div className={css((t) => ({ fontSize: "0.78rem", color: t.colors.textMuted, marginTop: t.spacing(1) }))}>
              User ID: {status.user.id}
            </div>
          </div>
        </Section>
      )}

      {/* Gmail Accounts */}
      <Section title="Gmail Accounts">
        {status?.gmailAccounts && status.gmailAccounts.length > 0 ? (
          <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
            {status.gmailAccounts.map((account) => (
              <div
                key={account.id}
                className={gmailAccountRowClass}
                style={account.isActive ? { background: "#eff6ff", borderColor: "#bfdbfe" } : undefined}
              >
                <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2) }))}>
                  <span>{account.email}</span>
                  {account.isActive && (
                    <span className={css({ fontSize: "0.72rem", color: "#1e40af", fontWeight: "600", background: "#dbeafe", padding: "1px 8px", borderRadius: "999px" })}>
                      Active
                    </span>
                  )}
                  {account.isPrimary && (
                    <span className={css({ fontSize: "0.72rem", color: "#065f46", fontWeight: "600", background: "#d1fae5", padding: "1px 8px", borderRadius: "999px" })}>
                      Primary
                    </span>
                  )}
                </div>
                <div className={css((t) => ({ display: "flex", gap: t.spacing(1.5) }))}>
                  {!account.isActive && (
                    <button
                      onClick={() => handleSwitchGmail(account.id)}
                      className={css((t) => ({
                        padding: `${t.spacing(1)} ${t.spacing(2)}`,
                        border: `1px solid ${t.colors.border}`,
                        borderRadius: t.radiusSm,
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        "&:hover": { background: t.colors.bgAlt },
                      }))}
                    >
                      Use
                    </button>
                  )}
                  <button
                    onClick={() => handleUnlinkGmail(account.id)}
                    disabled={unlinkingId === account.id}
                    className={css((t) => ({
                      padding: `${t.spacing(1)} ${t.spacing(2)}`,
                      border: `1px solid ${t.colors.error}`,
                      borderRadius: t.radiusSm,
                      background: "transparent",
                      color: t.colors.error,
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      "&:hover": { background: "#fef2f2" },
                      "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
                    }))}
                  >
                    {unlinkingId === account.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.88rem" }))}>
            No Gmail accounts connected.
          </p>
        )}

        <a
          href="/auth/login"
          className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(1.5),
            marginTop: t.spacing(3),
            padding: `${t.spacing(2)} ${t.spacing(4)}`,
            border: `1px solid ${t.colors.border}`,
            borderRadius: t.radiusSm,
            background: t.colors.bg,
            textDecoration: "none",
            color: t.colors.text,
            fontSize: "0.85rem",
            fontWeight: "500",
            "&:hover": { background: t.colors.bgAlt, borderColor: t.colors.primary },
          }))}
        >
          📧 Connect Gmail Account
        </a>
      </Section>

      {/* Passkeys */}
      <Section title="Passkeys">
        <div className={css((t) => ({ fontSize: "0.88rem", color: t.colors.textMuted, marginBottom: t.spacing(3), lineHeight: "1.6" }))}>
          {status?.hasPasskey
            ? "You have a passkey registered. You can add more for backup."
            : "Register a passkey for fast, passwordless login."}
        </div>

        {isPasskeySupported() ? (
          <button
            onClick={handleRegisterPasskey}
            disabled={passkeyRegistering}
            className={css((t) => ({
              padding: `${t.spacing(2.5)} ${t.spacing(5)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: t.colors.primary,
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.88rem",
              fontWeight: "600",
              transition: "background 0.15s",
              "&:hover:not(:disabled)": { background: t.colors.primaryHover },
              "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
            }))}
          >
            🔑 {passkeyRegistering ? "Registering…" : "Register Passkey"}
          </button>
        ) : (
          <p className={css((t) => ({ color: t.colors.error, fontSize: "0.85rem" }))}>
            Your browser does not support passkeys.
          </p>
        )}

        {passkeyMsg && (
          <div className={css((t) => ({ marginTop: t.spacing(2), padding: t.spacing(3), background: "#ecfdf5", borderRadius: t.radiusSm, color: "#065f46", fontSize: "0.85rem" }))}>
            {passkeyMsg}
          </div>
        )}
        {passkeyError && (
          <div className={css((t) => ({ marginTop: t.spacing(2), padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radiusSm, color: t.colors.error, fontSize: "0.85rem" }))}>
            {passkeyError}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={css((t) => ({ marginBottom: t.spacing(6) }))}>
      <h2 className={css((t) => ({
        fontSize: "0.82rem",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: t.colors.textMuted,
        marginBottom: t.spacing(3),
        paddingBottom: t.spacing(2),
        borderBottom: `1px solid ${t.colors.borderLight}`,
      }))}>
        {title}
      </h2>
      {children}
    </section>
  );
}
