import { useState, useEffect } from "react";
import { css } from "@flow-css/core/css";
import TriageSuggestions from "./TriageSuggestions";

interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead?: boolean;
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
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inboxCollapsed, setInboxCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setAuthenticated(data.authenticated);
        if (data.authenticated) fetchInbox();
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
        setAuthenticated(false);
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

  async function handleLogout() {
    await fetch("/auth/logout");
    setAuthenticated(false);
    setMessages([]);
  }

  const unreadCount = messages.filter((m) => m.isRead === false).length;

  // --- Loading state ---
  if (authenticated === null || (loading && authenticated)) {
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
        <p className={css((t) => ({ color: t.colors.textMuted }))}>
          Sign in with Google to view your inbox.
        </p>
        <a
          href="/auth/login"
          className={css((t) => ({
            display: "inline-block",
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
          Sign in with Google
        </a>
      </div>
    );
  }

  // --- Main authenticated view ---
  return (
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
        <h1 className={css({ fontSize: "1.5rem", fontWeight: "700" })}>
          📬 Mailania
        </h1>
        <div className={css((t) => ({ display: "flex", gap: t.spacing(3) }))}>
          <button
            onClick={fetchInbox}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(4)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.9rem",
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleLogout}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(4)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.9rem",
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

      {/* 2-column layout: TRIAGE primary (left, wider) + INBOX secondary (right, narrower) */}
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
        {/* Triage column — PRIMARY focus, takes majority of space */}
        {!loading && (
          <div
            className={css({
              flex: "1 1 0%",
              minWidth: 0,
            })}
          >
            <TriageSuggestions
              messages={messages}
              onAuthLost={() => {
                setAuthenticated(false);
                setMessages([]);
              }}
            />
          </div>
        )}

        {/* Inbox column — SECONDARY, collapsible sidebar */}
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
          {/* Inbox section header — clickable to collapse */}
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
                  aria-label={`${messages.length} messages${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
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

          {/* Inbox content — collapsible */}
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
              {/* Loading skeleton */}
              {loading && (
                <div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <InboxSkeletonRow key={i} />
                  ))}
                </div>
              )}

              {/* Empty */}
              {!loading && messages.length === 0 && !error && (
                <div
                  className={css((t) => ({
                    textAlign: "center",
                    padding: `${t.spacing(8)} ${t.spacing(4)}`,
                  }))}
                >
                  <div className={css((t) => ({ fontSize: "2rem", marginBottom: t.spacing(2) }))}>🎉</div>
                  <p className={css({ fontWeight: "600", fontSize: "0.95rem" })}>Inbox zero!</p>
                  <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.85rem", marginTop: t.spacing(1) }))}>
                    Check back later or run triage.
                  </p>
                </div>
              )}

              {/* Messages */}
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
  "&:focus-visible": {
    outline: `2px solid ${t.colors.primary}`,
    outlineOffset: "-2px",
    borderRadius: t.radiusSm,
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
  minWidth: "50px",
  textAlign: "right",
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
