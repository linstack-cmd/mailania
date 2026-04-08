/**
 * Account Settings page.
 *
 * Manage: user profile, linked Gmail accounts, passkey credentials.
 */

import { useState, useEffect, useCallback } from "react";
import { css } from "@flow-css/core/css";
import { registerPasskey, isPasskeySupported } from "./passkey";
import theme from "./theme";

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

interface PasskeyInfo {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
}

const gmailAccountRowClass = css((t) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  background: t.colors.bgAlt,
  border: `1px solid ${t.colors.borderLight}`,
  borderRadius: t.radiusSm,
  fontSize: t.fontSize.sm,
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
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [triagePreferences, setTriagePreferences] = useState("");
  const [savedTriagePreferences, setSavedTriagePreferences] = useState("");
  const [triagePreferencesLoading, setTriagePreferencesLoading] = useState(true);
  const [triagePreferencesSaving, setTriagePreferencesSaving] = useState(false);
  const [triagePreferencesMsg, setTriagePreferencesMsg] = useState<string | null>(null);
  const [triagePreferencesError, setTriagePreferencesError] = useState<string | null>(null);

  const fetchPasskeys = useCallback(async () => {
    try {
      const res = await fetch("/api/account/passkeys");
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys);
      }
    } catch { /* ignore */ }
    setPasskeysLoading(false);
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  useEffect(() => {
    async function fetchTriagePreferences() {
      try {
        const res = await fetch("/api/account/triage-preferences");
        if (res.ok) {
          const data = await res.json();
          const nextValue = data.triagePreferences || "";
          setTriagePreferences(nextValue);
          setSavedTriagePreferences(nextValue);
        }
      } catch {
        // ignore
      } finally {
        setTriagePreferencesLoading(false);
      }
    }

    fetchTriagePreferences();
  }, []);

  async function handleSaveTriagePreferences() {
    setTriagePreferencesSaving(true);
    setTriagePreferencesError(null);
    setTriagePreferencesMsg(null);

    try {
      const res = await fetch("/api/account/triage-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triagePreferences }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTriagePreferencesError(data.error || "Failed to save Triage Preferences");
        return;
      }

      const savedValue = data.triagePreferences || "";
      setTriagePreferences(savedValue);
      setSavedTriagePreferences(savedValue);
      setTriagePreferencesMsg("Triage Preferences saved.");
    } catch {
      setTriagePreferencesError("Failed to save Triage Preferences");
    } finally {
      setTriagePreferencesSaving(false);
    }
  }

  async function handleRegisterPasskey() {
    setPasskeyRegistering(true);
    setPasskeyError(null);
    setPasskeyMsg(null);
    try {
      await registerPasskey();
      setPasskeyMsg("✅ Passkey registered successfully!");
      await fetchPasskeys();
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

  function startEditing(pk: PasskeyInfo) {
    setEditingPasskeyId(pk.id);
    setEditingName(pk.name || formatPasskeyLabel(pk));
  }

  async function handleRenamePasskey(credentialId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setPasskeyError(null);
    try {
      const res = await fetch(`/api/account/passkeys/${encodeURIComponent(credentialId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasskeyError(data.error || "Failed to rename passkey");
      } else {
        await fetchPasskeys();
      }
    } catch {
      setPasskeyError("Failed to rename passkey");
    }
    setEditingPasskeyId(null);
  }

  async function handleDeletePasskey(credentialId: string) {
    if (!confirm("Delete this passkey? You won't be able to sign in with it anymore.")) return;
    setDeletingPasskeyId(credentialId);
    setPasskeyError(null);
    setPasskeyMsg(null);
    try {
      const res = await fetch(`/api/account/passkeys/${encodeURIComponent(credentialId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasskeyError(data.error || "Failed to delete passkey");
      } else {
        setPasskeyMsg("Passkey deleted.");
        await fetchPasskeys();
        onStatusChange();
      }
    } catch {
      setPasskeyError("Failed to delete passkey");
    }
    setDeletingPasskeyId(null);
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

  const triagePreferencesDirty = triagePreferences !== savedTriagePreferences;

  return (
    <div className={css((t) => ({ maxWidth: "600px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(5)}` }))}>
      <button
        onClick={onBack}
        className="settings-back-btn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>

      <h1 className={css((t) => ({ fontSize: t.fontSize.xl, fontWeight: t.fontWeight.bold, marginBottom: t.spacing(6), display: "flex", alignItems: "center", gap: t.spacing(2) }))}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" style={{marginRight:0}}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        Account Settings
      </h1>

      {/* User info */}
      {status?.user && (
        <Section title="Profile">
          <div className={css((t) => ({ fontSize: t.fontSize.sm, lineHeight: t.lineHeight.relaxed }))}>
            <div><strong>Name:</strong> {status.user.displayName}</div>
            {status.user.email && <div><strong>Email:</strong> {status.user.email}</div>}
            <div className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, marginTop: t.spacing(1) }))}>
              User ID: {status.user.id}
            </div>
          </div>
        </Section>
      )}

      <Section title="Triage Preferences">
        <div className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted, marginBottom: t.spacing(3), lineHeight: t.lineHeight.relaxed }))}>
          Give Mailania a little context about how you want your inbox triaged. This is freeform guidance used during suggestion generation.
        </div>

        {triagePreferencesLoading ? (
          <div className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted, padding: t.spacing(3) }))}>
            Loading Triage Preferences…
          </div>
        ) : (
          <>
            <textarea
              value={triagePreferences}
              onChange={(e) => {
                setTriagePreferences(e.target.value);
                if (triagePreferencesMsg) setTriagePreferencesMsg(null);
                if (triagePreferencesError) setTriagePreferencesError(null);
              }}
              rows={8}
              placeholder={"Examples: keep VIPs from my team visible, treat newsletters as safe to archive, be extra cautious with anything urgent or client-related, and prefer a calm concise tone in rationales."}
              className={css((t) => ({
                width: "100%",
                minHeight: "180px",
                resize: "vertical",
                padding: t.spacing(3),
                border: `1px solid ${t.colors.border}`,
                borderRadius: t.radiusSm,
                background: t.colors.bg,
                color: t.colors.text,
                fontSize: t.fontSize.sm,
                lineHeight: t.lineHeight.relaxed,
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
                transition: "border-color 0.15s, box-shadow 0.15s",
                "&:focus": {
                  borderColor: t.colors.primary,
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${t.colors.primary} 15%, transparent)`,
                },
                "&:focus-visible": {
                  outline: `2px solid ${t.colors.primary}`,
                  outlineOffset: "-2px",
                },
              }))}
            />
            <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", gap: t.spacing(2), marginTop: t.spacing(2), flexWrap: "wrap" }))}>
              <div className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted }))}>
                Examples: VIPs, newsletters, urgency, tone, or anything Mailania should be extra cautious about.
              </div>
              <button
                onClick={handleSaveTriagePreferences}
                disabled={triagePreferencesSaving || !triagePreferencesDirty}
                className={css((t) => ({
                  padding: `${t.spacing(2)} ${t.spacing(4)}`,
                  border: "none",
                  borderRadius: t.radiusSm,
                  background: t.colors.primary,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: t.fontSize.sm,
                  fontWeight: t.fontWeight.semibold,
                  minHeight: "44px",
                  transition: "background 0.15s",
                  "&:hover:not(:disabled)": { background: t.colors.primaryHover },
                  "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
                  "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
                }))}
              >
                {triagePreferencesSaving ? "Saving…" : "Save Triage Preferences"}
              </button>
            </div>
            {triagePreferencesMsg && (
              <div className={css((t) => ({ marginTop: t.spacing(2), padding: t.spacing(3), background: "#ecfdf5", borderRadius: t.radiusSm, color: "#065f46", fontSize: t.fontSize.sm }))}>
                {triagePreferencesMsg}
              </div>
            )}
            {triagePreferencesError && (
              <div className={css((t) => ({ marginTop: t.spacing(2), padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radiusSm, color: t.colors.error, fontSize: t.fontSize.sm }))}>
                {triagePreferencesError}
              </div>
            )}
          </>
        )}
      </Section>

      {/* Gmail Accounts */}
      <Section title="Gmail Accounts">
        {status?.gmailAccounts && status.gmailAccounts.length > 0 ? (
          <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
            {status.gmailAccounts.map((account) => (
              <div
                key={account.id}
                className={gmailAccountRowClass}
                style={account.isActive ? { background: theme.colors.primaryLight, borderColor: theme.colors.primaryLight } : undefined}
              >
                <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2) }))}>
                  <span className={css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 })}>{account.email}</span>
                  {account.isActive && (
                    <span className={css((t) => ({ fontSize: t.fontSize.xs, color: "#1e40af", fontWeight: "600", background: "#dbeafe", padding: "1px 8px", borderRadius: "999px" }))}>
                      Active
                    </span>
                  )}
                  {account.isPrimary && (
                    <span className={css((t) => ({ fontSize: t.fontSize.xs, color: "#065f46", fontWeight: "600", background: "#d1fae5", padding: "1px 8px", borderRadius: "999px" }))}>
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
                        fontSize: t.fontSize.sm,
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
                      fontSize: t.fontSize.sm,
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
          <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.sm }))}>
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
            padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
            border: `1px solid ${t.colors.border}`,
            borderRadius: t.radiusSm,
            background: t.colors.bg,
            textDecoration: "none",
            color: t.colors.text,
            fontSize: t.fontSize.sm,
            fontWeight: t.fontWeight.semibold,
            minHeight: "44px",
            "&:hover": { background: t.colors.bgAlt, borderColor: t.colors.primary },
            "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
          }))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Connect Gmail Account
        </a>
      </Section>

      {/* Passkeys */}
      <Section title="Passkeys">
        <div className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted, marginBottom: t.spacing(3), lineHeight: t.lineHeight.relaxed }))}>
          Passkeys are your only sign-in method. Register multiple passkeys for backup access.
        </div>

        {/* Passkey list */}
        {passkeysLoading ? (
          <div className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted, padding: t.spacing(3) }))}>
            Loading passkeys…
          </div>
        ) : passkeys.length > 0 ? (
          <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2), marginBottom: t.spacing(3) }))}>
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                className={css((t) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                  background: t.colors.bgAlt,
                  border: `1px solid ${t.colors.borderLight}`,
                  borderRadius: t.radiusSm,
                  fontSize: t.fontSize.sm,
                }))}
              >
                <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(1), minWidth: 0, flex: 1 }))}>
                  <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(1.5), flexWrap: "wrap" }))}>
                    {editingPasskeyId === pk.id ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleRenamePasskey(pk.id); }}
                        className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(1) }))}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6,verticalAlign:"middle",flexShrink:0}}><circle cx="8" cy="8" r="4"/><path d="M12 8h8m-4-4v8"/></svg>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          maxLength={100}
                          autoFocus
                          onBlur={() => handleRenamePasskey(pk.id)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditingPasskeyId(null); }}
                          className={css((t) => ({
                            fontWeight: t.fontWeight.semibold,
                            fontSize: t.fontSize.sm,
                            border: `1px solid ${t.colors.primary}`,
                            borderRadius: t.radiusSm,
                            padding: `${t.spacing(0.5)} ${t.spacing(1.5)}`,
                            outline: "none",
                            background: t.colors.bg,
                            color: t.colors.text,
                            width: "100%",
                            maxWidth: "180px",
                            "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "-2px" },
                          }))}
                        />
                      </form>
                    ) : (
                      <>
                        <span
                          style={{ fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                          onClick={() => startEditing(pk)}
                          title="Click to rename"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0,verticalAlign:"middle"}}><circle cx="8" cy="8" r="4"/><path d="M12 8h8m-4-4v8"/></svg>
                          {pk.name || formatPasskeyLabel(pk)}
                        </span>
                        <button
                          onClick={() => startEditing(pk)}
                          title="Rename"
                          className={css((t) => ({
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: t.fontSize.xs,
                            color: t.colors.textMuted,
                            padding: "0 2px",
                            "&:hover": { color: t.colors.primary },
                            "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
                          }))}
                        >
                          ✏️
                        </button>
                      </>
                    )}
                    {pk.backedUp && (
                      <span className={css((t) => ({ fontSize: t.fontSize.xs, color: "#065f46", fontWeight: t.fontWeight.semibold, background: "#d1fae5", padding: "1px 8px", borderRadius: "999px" }))}>
                        Synced
                      </span>
                    )}
                    <span className={css((t) => ({ fontSize: t.fontSize.xs, color: "#1e40af", fontWeight: t.fontWeight.semibold, background: "#dbeafe", padding: "1px 8px", borderRadius: "999px" }))}>
                      {pk.deviceType === "multiDevice" ? "Multi-device" : "Single-device"}
                    </span>
                  </div>
                  <div className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted }))}>
                    {pk.name && formatPasskeyLabel(pk) !== pk.name && (
                      <span>{formatPasskeyLabel(pk)} · </span>
                    )}
                    Created {formatPasskeyDate(pk.createdAt)}
                    {pk.transports.length > 0 && ` · ${pk.transports.join(", ")}`}
                  </div>
                  <div className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, fontFamily: "monospace" }))}>
                    ID: {pk.id.length > 16 ? pk.id.slice(0, 8) + "…" + pk.id.slice(-8) : pk.id}
                  </div>
                </div>
                <div className={css((t) => ({ flexShrink: 0, marginLeft: t.spacing(2) }))}>
                  {passkeys.length <= 1 ? (
                    <span
                      title="This is your only passkey — you can't delete it"
                      className={css((t) => ({
                        fontSize: t.fontSize.xs,
                        color: t.colors.textMuted,
                        fontStyle: "italic",
                      }))}
                    >
                      Only passkey
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDeletePasskey(pk.id)}
                      disabled={deletingPasskeyId === pk.id}
                      className={css((t) => ({
                        padding: `${t.spacing(1)} ${t.spacing(2)}`,
                        border: `1px solid ${t.colors.error}`,
                        borderRadius: t.radiusSm,
                        background: "transparent",
                        color: t.colors.error,
                        cursor: "pointer",
                        fontSize: t.fontSize.xs,
                        "&:hover": { background: "#fef2f2" },
                        "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
                        "&:focus-visible": { outline: `2px solid ${t.colors.error}`, outlineOffset: "2px" },
                      }))}
                    >
                      {deletingPasskeyId === pk.id ? "…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted, marginBottom: t.spacing(3) }))}>
            No passkeys registered yet.
          </div>
        )}

        {isPasskeySupported() ? (
          <button
            onClick={handleRegisterPasskey}
            disabled={passkeyRegistering}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: t.spacing(1.5),
              padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: t.colors.primary,
              color: "#fff",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: t.fontWeight.semibold,
              minHeight: "44px",
              transition: "background 0.15s",
              "&:hover:not(:disabled)": { background: t.colors.primaryHover },
              "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
              "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
            }))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0,verticalAlign:"middle"}}><circle cx="8" cy="8" r="4"/><path d="M12 8h8m-4-4v8"/></svg>
            {passkeyRegistering && <span className="spinner" />}
            {passkeyRegistering ? "Registering…" : "Add Passkey"}
          </button>
        ) : (
          <p className={css((t) => ({ color: t.colors.error, fontSize: t.fontSize.sm }))}>
            Your browser does not support passkeys.
          </p>
        )}

        {passkeyMsg && (
          <div className={css((t) => ({ marginTop: t.spacing(2), padding: t.spacing(3), background: "#ecfdf5", borderRadius: t.radiusSm, color: "#065f46", fontSize: t.fontSize.sm }))}>
            {passkeyMsg}
          </div>
        )}
        {passkeyError && (
          <div className={css((t) => ({ marginTop: t.spacing(2), padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radiusSm, color: t.colors.error, fontSize: t.fontSize.sm }))}>
            {passkeyError}
          </div>
        )}
      </Section>
    </div>
  );
}

function formatPasskeyLabel(pk: PasskeyInfo): string {
  const transports = pk.transports;
  if (transports.includes("hybrid")) return "Phone / Tablet";
  if (transports.includes("internal")) return "This device";
  if (transports.includes("usb")) return "Security key (USB)";
  if (transports.includes("ble")) return "Security key (Bluetooth)";
  if (transports.includes("nfc")) return "Security key (NFC)";
  if (pk.deviceType === "multiDevice") return "Synced passkey";
  return "Passkey";
}

function formatPasskeyDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={css((t) => ({ marginBottom: t.spacing(6) }))}>
      <h2 className={css((t) => ({
        fontSize: t.fontSize.lg,
        fontWeight: t.fontWeight.bold,
        color: t.colors.text,
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
