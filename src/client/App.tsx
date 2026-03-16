import { useState, useEffect } from "react";
import { css } from "@flow-css/core/css";
import TriageSuggestions from "./TriageSuggestions";

interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

function formatFrom(raw: string): string {
  // "John Doe <john@example.com>" → "John Doe"
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

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // --- Render ---

  if (authenticated === null || (loading && authenticated)) {
    return (
      <div className={css({ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" })}>
        <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "1.1rem" }))}>Loading…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={css({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: (t) => t.spacing(4) })}>
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

  return (
    <div className={css({ maxWidth: "900px", margin: "0 auto", padding: (t) => `${t.spacing(6)} ${t.spacing(4)}` })}>
      {/* Header */}
      <header
        className={css((t) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: t.spacing(4),
          marginBottom: t.spacing(4),
          borderBottom: `2px solid ${t.colors.border}`,
        }))}
      >
        <h1 className={css({ fontSize: "1.5rem", fontWeight: "700" })}>
          📬 Mailania
          {messages.length > 0 && (
            <span
              className={css((t) => ({
                marginLeft: t.spacing(2),
                background: t.colors.primary,
                color: "#fff",
                padding: `${t.spacing(0.5)} ${t.spacing(2)}`,
                borderRadius: "999px",
                fontSize: "0.8rem",
                verticalAlign: "middle",
              }))}
            >
              {messages.length}
            </span>
          )}
        </h1>
        <div className={css({ display: "flex", gap: (t) => t.spacing(3) })}>
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
        <div className={css((t) => ({ padding: t.spacing(4), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, marginBottom: t.spacing(4) }))}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className={css((t) => ({ textAlign: "center", padding: t.spacing(8), color: t.colors.textMuted }))}>
          Loading inbox…
        </p>
      )}

      {/* Empty */}
      {!loading && messages.length === 0 && !error && (
        <p className={css((t) => ({ textAlign: "center", padding: t.spacing(8), color: t.colors.textMuted }))}>
          Your inbox is empty.
        </p>
      )}

      {/* Messages */}
      {!loading &&
        messages.map((msg) => (
          <div
            key={msg.id}
            className={css((t) => ({
              padding: `${t.spacing(4)} 0`,
              borderBottom: `1px solid ${t.colors.borderLight}`,
              "&:last-child": { borderBottom: "none" },
            }))}
          >
            <div className={css({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: (t) => t.spacing(3) })}>
              <span className={css({ fontWeight: "600", fontSize: "0.95rem" })}>
                {formatFrom(msg.from)}
              </span>
              <span className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.8rem", flexShrink: "0" }))}>
                {formatDate(msg.date)}
              </span>
            </div>
            <div className={css({ fontSize: "0.95rem", marginTop: (t) => t.spacing(1) })}>
              {msg.subject}
            </div>
            <div className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.85rem", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))}>
              {msg.snippet}
            </div>
          </div>
        ))}

      {/* Triage Suggestions */}
      {!loading && <TriageSuggestions onAuthLost={() => { setAuthenticated(false); setMessages([]); }} />}
    </div>
  );
}
