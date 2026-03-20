import { useState, useEffect } from "react";
import { css } from "@flow-css/core/css";
import { Router, Route, Switch } from "wouter";
import TriageSuggestions from "./TriageSuggestions";
import SuggestionDetailPage from "./SuggestionDetailPage";
import { loginWithPasskey, isPasskeySupported } from "./passkey";
import AccountSettings from "./AccountSettings";

interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead?: boolean;
}

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

function formatFrom(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : raw;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return raw;
  }
}

// --- Skeleton shimmer ---
const skeletonLineClass = css({
  borderRadius: "4px",
  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
  backgroundSize: "200px 100%",
  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
});

function SkeletonLine({ width = "100%", height = "12px" }: { width?: string; height?: string }) {
  return <div className={skeletonLineClass} style={{ width, height }} />;
}

function InboxSkeletonRow() {
  return (
    <div
      className={css((t) => ({
        padding: `${t.spacing(3)} ${t.spacing(4)}`,
        borderBottom: `1px solid ${t.colors.borderLight}`,
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(2),
        minHeight: "60px",
      }))}
    >
      <div className={css({ display: "flex", justifyContent: "space-between", alignItems: "center" })}>
        <SkeletonLine width="35%" height="13px" />
        <SkeletonLine width="50px" height="11px" />
      </div>
      <SkeletonLine width="70%" height="12px" />
      <SkeletonLine width="90%" height="10px" />
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inboxCollapsed, setInboxCollapsed] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data: StatusData) => {
        setStatus(data);
        if (data.authenticated && data.gmailConnected) fetchInbox();
        else setLoading(false);
      })
      .catch(() => {
        setError("Cannot reach server");
        setLoading(false);
      });
  }, []);

  async function fetchInbox() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox");
      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setMessages(data.messages);
    } catch {
      setError("Failed to load inbox");
    }
    setLoading(false);
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data: StatusData = await res.json();
      setStatus(data);
      if (data.authenticated && data.gmailConnected) fetchInbox();
    } catch { /* ignore */ }
  }

  async function handleLogout() {
    await fetch("/auth/logout");
    setStatus({ authenticated: false });
    setMessages([]);
  }

  async function handlePasskeyLogin() {
    setPasskeyLoading(true);
    setPasskeyError(null);
    try {
      await loginWithPasskey();
      // Refresh status after successful login
      await refreshStatus();
    } catch (err: any) {
      setPasskeyError(err.message || "Passkey login failed");
    } finally {
      setPasskeyLoading(false);
    }
  }

  const authenticated = status?.authenticated ?? false;
  const gmailConnected = status?.gmailConnected ?? false;
  const unreadCount = messages.filter((m) => m.isRead === false).length;

  // --- Loading state ---
  if (status === null || (loading && authenticated)) {
    return (
      <div className={css((t) => ({ maxWidth: "1400px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(4)}` }))}>
        <div className={css((t) => ({ paddingBottom: t.spacing(4), marginBottom: t.spacing(4), borderBottom: `2px solid ${t.colors.border}` }))}>
          <SkeletonLine width="180px" height="24px" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <InboxSkeletonRow key={i} />
        ))}
      </div>
    );
  }

  // --- Login screen ---
  if (!authenticated) {
    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: t.spacing(4) }))}>
        <h1 className={css({ fontSize: "2rem", fontWeight: "700" })}>📬 Mailania</h1>
        <p className={css((t) => ({ color: t.colors.textMuted, textAlign: "center", maxWidth: "360px" }))}>
          Sign in with a passkey or connect your Google account.
        </p>

        <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(3), width: "280px" }))}>
          {/* Passkey login */}
          {isPasskeySupported() && (
            <button
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              className={css((t) => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: t.spacing(2),
                padding: `${t.spacing(3)} ${t.spacing(6)}`,
                background: t.colors.primary,
                color: "#fff",
                borderRadius: t.radius,
                border: "none",
                fontWeight: "600",
                fontSize: "1rem",
                cursor: "pointer",
                transition: "background 0.15s",
                "&:hover:not(:disabled)": { background: t.colors.primaryHover },
                "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
              }))}
            >
              🔑 {passkeyLoading ? "Authenticating…" : "Sign in with Passkey"}
            </button>
          )}

          {/* Google OAuth login */}
          <a
            href="/auth/login"
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: t.spacing(2),
              padding: `${t.spacing(3)} ${t.spacing(6)}`,
              background: "#fff",
              color: t.colors.text,
              borderRadius: t.radius,
              textDecoration: "none",
              fontWeight: "600",
              fontSize: "1rem",
              border: `1px solid ${t.colors.border}`,
              transition: "background 0.15s, border-color 0.15s",
              "&:hover": { background: t.colors.bgAlt, borderColor: t.colors.primary },
            }))}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign in with Google
          </a>

          {/* Passkey error */}
          {passkeyError && (
            <div className={css((t) => ({ padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, fontSize: "0.85rem", textAlign: "center" }))}>
              {passkeyError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Logged in but no Gmail connected ---
  if (!gmailConnected && !status?.localDev) {
    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: t.spacing(4) }))}>
        <h1 className={css({ fontSize: "1.5rem", fontWeight: "700" })}>📬 Mailania</h1>
        <p className={css((t) => ({ color: t.colors.textMuted, textAlign: "center", maxWidth: "400px" }))}>
          Welcome{status?.user?.displayName ? `, ${status.user.displayName}` : ""}! Connect your Gmail account to get started.
        </p>

        <a
          href="/auth/login"
          className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(2),
            padding: `${t.spacing(3)} ${t.spacing(6)}`,
            background: t.colors.primary,
            color: "#fff",
            borderRadius: t.radius,
            textDecoration: "none",
            fontWeight: "600",
            fontSize: "1rem",
            transition: "background 0.15s",
            "&:hover": { background: t.colors.primaryHover },
          }))}
        >
          Connect Gmail Account
        </a>

        <button
          onClick={handleLogout}
          className={css((t) => ({
            padding: `${t.spacing(2)} ${t.spacing(4)}`,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: "0.85rem",
            color: t.colors.textMuted,
            "&:hover": { color: t.colors.text },
          }))}
        >
          Sign out
        </button>
      </div>
    );
  }

  // --- Main authenticated view ---
  return (
    <Router>
    <Switch>
      <Route path="/suggestions/:runId/:index">
        <SuggestionDetailPage />
      </Route>
      <Route path="/settings">
        <AccountSettings
          status={status}
          onBack={() => window.history.back()}
          onStatusChange={refreshStatus}
        />
      </Route>
      <Route>
    <div className={css((t) => ({ maxWidth: "1400px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(5)}` }))}>
      {/* Header */}
      <header
        className={css((t) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: t.spacing(4),
          marginBottom: t.spacing(5),
          borderBottom: `2px solid ${t.colors.border}`,
        }))}
      >
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(3) }))}>
          <h1 className={css({ fontSize: "1.5rem", fontWeight: "700" })}>
            📬 Mailania
          </h1>
          {status?.user && (
            <span className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted }))}>
              {status.user.displayName}
              {status.gmailAccounts && status.gmailAccounts.length > 0 && (
                <> · {status.gmailAccounts.find((a) => a.isActive)?.email}</>
              )}
            </span>
          )}
        </div>
        <div className={css((t) => ({ display: "flex", gap: t.spacing(2) }))}>
          <button
            onClick={fetchInbox}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.85rem",
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            ↻ Refresh
          </button>
          <a
            href="/settings"
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.85rem",
              textDecoration: "none",
              color: t.colors.text,
              display: "inline-flex",
              alignItems: "center",
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            ⚙️ Account
          </a>
          <button
            onClick={handleLogout}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.85rem",
              color: t.colors.textMuted,
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className={css((t) => ({ padding: t.spacing(4), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, marginBottom: t.spacing(4), display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(3) }))}>
          <span>{error}</span>
          <button
            onClick={fetchInbox}
            className={css((t) => ({
              padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.error}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.error,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "600",
              flexShrink: 0,
              "&:hover": { background: "rgba(239,68,68,0.08)" },
            }))}
          >
            Retry
          </button>
        </div>
      )}

      {/* 2-column layout */}
      <div
        className={css((t) => ({
          display: "flex",
          gap: t.spacing(5),
          alignItems: "flex-start",
          "@media (max-width: 960px)": {
            flexDirection: "column",
          },
        }))}
      >
        {/* Triage column */}
        {!loading && (
          <div className={css({ flex: "1 1 0%", minWidth: 0 })}>
            <TriageSuggestions
              messages={messages}
              onAuthLost={() => {
                setStatus((s) => s ? { ...s, authenticated: false } : null);
                setMessages([]);
              }}
            />
          </div>
        )}

        {/* Inbox column */}
        <div
          className={css({
            flex: "0 0 380px",
            minWidth: 0,
            "@media (max-width: 960px)": {
              flex: "1 1 auto",
              width: "100%",
            },
          })}
        >
          <button
            onClick={() => setInboxCollapsed((v) => !v)}
            aria-expanded={!inboxCollapsed}
            aria-controls="inbox-panel"
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: `${t.spacing(3)} ${t.spacing(4)}`,
              background: t.colors.bgAlt,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radius,
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: "700",
              color: t.colors.text,
              transition: "background 0.15s, border-radius 0.15s",
              "&:hover": { background: t.colors.borderLight },
              "&:focus-visible": {
                outline: `2px solid ${t.colors.primary}`,
                outlineOffset: "-2px",
              },
            }))}
            style={inboxCollapsed ? undefined : { borderRadius: "0.5rem 0.5rem 0 0" }}
          >
            <span>
              📥 Inbox
              {messages.length > 0 && (
                <span
                  className={css((t) => ({
                    marginLeft: t.spacing(2),
                    background: t.colors.primary,
                    color: "#fff",
                    padding: `${t.spacing(0.5)} ${t.spacing(2)}`,
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    verticalAlign: "middle",
                    fontWeight: "600",
                  }))}
                  title={`${messages.length} messages${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
                >
                  {messages.length}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: "0.8rem",
                transition: "transform 0.2s",
                transform: inboxCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                display: "inline-block",
              }}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>

          {!inboxCollapsed && (
            <div
              id="inbox-panel"
              className={css((t) => ({
                border: `1px solid ${t.colors.border}`,
                borderTop: "none",
                borderRadius: `0 0 ${t.radius} ${t.radius}`,
                background: t.colors.bg,
                maxHeight: "calc(100vh - 200px)",
                overflowY: "auto",
                scrollbarWidth: "thin",
                scrollbarColor: "#d1d5db transparent",
                "@media (max-width: 960px)": {
                  maxHeight: "400px",
                },
              }))}
            >
              {loading && (
                <div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <InboxSkeletonRow key={i} />
                  ))}
                </div>
              )}

              {!loading && messages.length === 0 && !error && (
                <div className={css((t) => ({ textAlign: "center", padding: `${t.spacing(8)} ${t.spacing(4)}` }))}>
                  <div className={css((t) => ({ fontSize: "2rem", marginBottom: t.spacing(2) }))}>🎉</div>
                  <p className={css({ fontWeight: "600", fontSize: "0.95rem" })}>Inbox zero!</p>
                  <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.85rem", marginTop: t.spacing(1) }))}>
                    Check back later or run triage.
                  </p>
                </div>
              )}

              {!loading && messages.length > 0 && (
                <div role="list" aria-label="Inbox messages">
                  {messages.map((msg) => (
                    <MessageRow key={msg.id} msg={msg} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
      </Route>
    </Switch>
    </Router>
  );
}

// --- Message row styles ---
const msgRowClass = css((t) => ({
  padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
  borderBottom: `1px solid ${t.colors.borderLight}`,
  cursor: "pointer",
  display: "flex",
  alignItems: "flex-start",
  gap: t.spacing(2.5),
  minHeight: "56px",
  transition: "background 0.15s, border-left-color 0.15s",
  borderLeft: "3px solid transparent",
  "&:hover": {
    background: "#eef2ff",
    borderLeftColor: t.colors.primary,
  },
  "&:last-child": { borderBottom: "none" },
}));

const unreadDotClass = css((t) => ({
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  background: t.colors.primary,
}));

const msgFromUnreadClass = css({
  fontWeight: "700",
  fontSize: "0.88rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
});

const msgFromReadClass = css({
  fontWeight: "500",
  fontSize: "0.88rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
});

const msgSubjectUnreadClass = css((t) => ({
  fontSize: "0.88rem",
  fontWeight: "600",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const msgSubjectReadClass = css((t) => ({
  fontSize: "0.88rem",
  fontWeight: "400",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const msgSnippetUnreadClass = css((t) => ({
  color: t.colors.textMuted,
  fontSize: "0.8rem",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const msgSnippetReadClass = css((t) => ({
  color: "#9ca3af",
  fontSize: "0.8rem",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const msgDateClass = css((t) => ({
  color: t.colors.textMuted,
  fontSize: "0.75rem",
  flexShrink: 0,
}));

function MessageRow({ msg }: { msg: InboxMessage }) {
  const isUnread = msg.isRead === false;

  return (
    <div role="listitem" tabIndex={0} className={msgRowClass}>
      <div className={css({ width: "7px", flexShrink: 0, paddingTop: "5px" })}>
        {isUnread && <div className={unreadDotClass} />}
      </div>
      <div className={css({ flex: "1 1 0%", minWidth: 0 })}>
        <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.spacing(2) }))}>
          <span className={isUnread ? msgFromUnreadClass : msgFromReadClass}>
            {formatFrom(msg.from)}
          </span>
          <span className={msgDateClass}>
            {formatDate(msg.date)}
          </span>
        </div>
        <div className={isUnread ? msgSubjectUnreadClass : msgSubjectReadClass}>
          {msg.subject}
        </div>
        <div className={isUnread ? msgSnippetUnreadClass : msgSnippetReadClass}>
          {msg.snippet}
        </div>
      </div>
    </div>
  );
}
