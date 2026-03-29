import { useState, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { css } from "@flow-css/core/css";

// --- Error boundary to surface crashes instead of blank screen ---
interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    const details = `${error.message}${error.stack ? `\n${error.stack}` : ""}${info.componentStack ? `\n${info.componentStack}` : ""}`;
    updateMobileDebug({ errorBoundaryError: details, appError: details });
    console.error("[Mailania crash]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "24px", fontFamily: "monospace", color: "#dc2626", background: "#fef2f2", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: "12px" }}>⚠️ App crashed</h2>
          <p style={{ marginBottom: "12px", color: "#7f1d1d" }}>Open the debug badge in the bottom-right and send Danny a screenshot of both this error and the panel.</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{this.state.error.message}{"\n"}{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Router, Route, Switch } from "wouter";
import SuggestionDetailPage from "./SuggestionDetailPage";
import { loginWithPasskey, signupWithPasskey, isPasskeySupported } from "./passkey";
import AccountSettings from "./AccountSettings";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";
import ProposalSidebar from "./ProposalSidebar";
import MobileProposalSheet from "./MobileProposalSheet";
import type { TriageSuggestion } from "./TriageSuggestions";
import { updateMobileDebug } from "./mobileDebug";

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

interface LatestTriageSummary {
  runId: string;
  createdAt: string;
  suggestionCount: number;
}

function normalizeInboxMessages(payload: unknown): InboxMessage[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((message, index) => {
    const record = (message && typeof message === "object") ? message as Record<string, unknown> : {};
    return {
      id: typeof record.id === "string" && record.id.length > 0 ? record.id : `message-${index}`,
      subject: typeof record.subject === "string" && record.subject.length > 0 ? record.subject : "(no subject)",
      from: typeof record.from === "string" ? record.from : "",
      date: typeof record.date === "string" ? record.date : "",
      snippet: typeof record.snippet === "string" ? record.snippet : "",
      isRead: typeof record.isRead === "boolean" ? record.isRead : undefined,
    };
  });
}

function normalizeLatestSuggestions(payload: unknown): TriageSuggestion[] | null {
  return Array.isArray(payload) ? payload as TriageSuggestion[] : null;
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
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [signupName, setSignupName] = useState("");
  const [generalChatMessages, setGeneralChatMessages] = useState<ChatMessageData[]>([]);
  const [generalChatInput, setGeneralChatInput] = useState("");
  const [generalChatLoading, setGeneralChatLoading] = useState(false);
  const [generalChatInitLoading, setGeneralChatInitLoading] = useState(false);
  const [generalChatError, setGeneralChatError] = useState<string | null>(null);
  const [latestTriageSummary, setLatestTriageSummary] = useState<LatestTriageSummary | null>(null);
  const [latestSuggestions, setLatestSuggestions] = useState<TriageSuggestion[] | null | undefined>(undefined);

  useEffect(() => {
    updateMobileDebug({
      authenticated: status?.authenticated ?? null,
      gmailConnected: status?.gmailConnected ?? null,
      statusUserExists: status?.user ? true : false,
      messagesCount: messages.length,
      generalChatMessagesCount: generalChatMessages.length,
      latestSuggestionsState:
        latestSuggestions === undefined
          ? "undefined"
          : latestSuggestions === null
            ? "null"
            : `count:${latestSuggestions.length}`,
      appError: error ?? generalChatError ?? passkeyError ?? null,
    });
  }, [status, messages.length, generalChatMessages.length, latestSuggestions, error, generalChatError, passkeyError]);

  useEffect(() => {
    updateMobileDebug({ statusFetch: "pending" });
    fetch("/api/status")
      .then(async (r) => {
        const data: StatusData = await r.json();
        updateMobileDebug({
          statusFetch: r.ok ? "ok" : "error",
          statusFetchHttp: r.status,
          statusFetchError: r.ok ? null : `HTTP ${r.status}`,
          authenticated: data.authenticated ?? null,
          gmailConnected: data.gmailConnected ?? null,
          statusUserExists: data.user ? true : false,
        });
        return data;
      })
      .then((data: StatusData) => {
        setStatus(data);
        if (data.authenticated && (data.gmailConnected || data.localDev)) {
          fetchInbox();
          fetchGeneralChat();
        } else {
          setLoading(false);
        }
      })
      .catch((err: any) => {
        const message = err?.message || "Cannot reach server";
        updateMobileDebug({ statusFetch: "error", statusFetchError: message, appError: message });
        setError("Cannot reach server");
        setLoading(false);
      });
  }, []);

  async function fetchInbox() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox");
      const errData = res.ok ? null : await res.json().catch(() => ({}));
      if (res.status === 401) {
        const errorCode = typeof errData?.code === "string" ? errData.code : null;
        if (errorCode === "GMAIL_RECONNECT_REQUIRED" || errorCode === "NO_GMAIL_ACCOUNT") {
          setStatus((s) => (s ? { ...s, gmailConnected: false } : s));
          throw new Error(errData?.error || "Please reconnect Gmail");
        }
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(errData?.error || `Failed to load inbox (${res.status})`);
      }
      const data = await res.json();
      setMessages(normalizeInboxMessages(data.messages));
    } catch (err: any) {
      setMessages([]);
      setError(err?.message || "Failed to load inbox");
    }
    setLoading(false);
  }

  async function fetchGeneralChat() {
    setGeneralChatInitLoading(true);
    setGeneralChatError(null);
    try {
      const [chatRes, triageRes] = await Promise.all([
        fetch("/api/chat/general"),
        fetch("/api/triage/latest"),
      ]);

      if (chatRes.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        setGeneralChatMessages([]);
        setLatestTriageSummary(null);
        setLatestSuggestions(null);
        return;
      }
      if (!chatRes.ok) {
        throw new Error("Failed to load inbox chat");
      }
      const data = await chatRes.json();
      setGeneralChatMessages(Array.isArray(data.messages) ? data.messages : []);
      setLatestTriageSummary(data.latestTriage
        ? {
            runId: data.latestTriage.runId,
            createdAt: data.latestTriage.createdAt,
            suggestionCount: data.latestTriage.suggestionCount,
          }
        : null);

      // Load latest triage suggestions for the proposal sidebar
      if (triageRes.ok) {
        const triageData = await triageRes.json();
        setLatestSuggestions(normalizeLatestSuggestions(triageData.suggestions));
      } else {
        setLatestSuggestions(null);
      }
    } catch {
      setGeneralChatMessages([]);
      setLatestTriageSummary(null);
      setLatestSuggestions(null);
      setGeneralChatError("Failed to load inbox chat");
    } finally {
      setGeneralChatInitLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      updateMobileDebug({ statusFetch: "pending" });
      const res = await fetch("/api/status");
      const data: StatusData = await res.json();
      updateMobileDebug({
        statusFetch: res.ok ? "ok" : "error",
        statusFetchHttp: res.status,
        statusFetchError: res.ok ? null : `HTTP ${res.status}`,
        authenticated: data.authenticated ?? null,
        gmailConnected: data.gmailConnected ?? null,
        statusUserExists: data.user ? true : false,
      });
      setStatus(data);
      if (data.authenticated && (data.gmailConnected || data.localDev)) {
        fetchInbox();
        fetchGeneralChat();
      }
    } catch (err: any) {
      updateMobileDebug({ statusFetch: "error", statusFetchError: err?.message || "refresh failed" });
    }
  }

  async function sendGeneralChatMessage() {
    if (!generalChatInput.trim() || generalChatLoading) return;
    const msg = generalChatInput.trim();
    const tempId = `temp-${Date.now()}`;

    setGeneralChatInput("");
    setGeneralChatLoading(true);
    setGeneralChatError(null);
    setGeneralChatMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: msg, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || "Failed to send message");
      }

      const data = await res.json();
      setGeneralChatMessages(Array.isArray(data.messages) ? data.messages : []);
      setLatestTriageSummary(data.latestTriage
        ? {
            runId: data.latestTriage.runId,
            createdAt: data.latestTriage.createdAt,
            suggestionCount: data.latestTriage.suggestionCount,
          }
        : null);
    } catch (err: any) {
      setGeneralChatError(err.message || "Failed to send message");
      setGeneralChatMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setGeneralChatLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/auth/logout");
    setStatus({ authenticated: false });
    setMessages([]);
    setGeneralChatMessages([]);
    setLatestTriageSummary(null);
    setLatestSuggestions(undefined);
  }

  async function handlePasskeyLogin() {
    setPasskeyLoading(true);
    setPasskeyError(null);
    try {
      await loginWithPasskey();
      await refreshStatus();
    } catch (err: any) {
      setPasskeyError(err.message || "Passkey login failed");
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function handlePasskeySignup() {
    if (!signupName.trim()) {
      setPasskeyError("Please enter a display name");
      return;
    }
    setPasskeyLoading(true);
    setPasskeyError(null);
    try {
      await signupWithPasskey(signupName.trim());
      await refreshStatus();
    } catch (err: any) {
      setPasskeyError(err.message || "Passkey signup failed");
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

  // --- Login screen (passkey-only) ---
  if (!authenticated) {
    const tabBaseClass = css((t) => ({
      flex: "1",
      padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
      border: "none",
      borderBottom: "2px solid transparent",
      background: "transparent",
      color: t.colors.textMuted,
      fontWeight: "500",
      fontSize: "0.92rem",
      cursor: "pointer",
      transition: "color 0.15s, border-color 0.15s",
      "&:hover": { color: t.colors.primary },
    }));
    const tabActiveClass = css((t) => ({
      borderBottomColor: t.colors.primary,
      color: t.colors.primary,
      fontWeight: "700",
    }));

    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: t.spacing(4), padding: `${t.spacing(5)} ${t.spacing(3)} calc(${t.spacing(5)} + env(safe-area-inset-bottom, 0px))`, boxSizing: "border-box" }))}>
        <h1 className={css((t) => ({ fontSize: "2rem", fontWeight: "700", textAlign: "center", lineHeight: "1.15", "@media (max-width: 640px)": { fontSize: "1.75rem" } }))}>📬 Mailania</h1>

        {!isPasskeySupported() ? (
          <div className={css((t) => ({ textAlign: "center", maxWidth: "360px", padding: t.spacing(4) }))}>
            <p className={css((t) => ({ color: t.colors.error, fontSize: "0.92rem", lineHeight: "1.6" }))}>
              Your browser does not support passkeys. Mailania requires a browser with WebAuthn support (Chrome, Safari, Firefox, Edge).
            </p>
          </div>
        ) : (
          <div className={css((t) => ({ width: "min(100%, 420px)", display: "flex", flexDirection: "column", gap: t.spacing(3), padding: `${t.spacing(4)} ${t.spacing(4.5)}`, border: `1px solid ${t.colors.borderLight}`, borderRadius: t.radius, background: t.colors.bg, boxShadow: t.shadow, boxSizing: "border-box", "@media (max-width: 480px)": { padding: `${t.spacing(3.5)} ${t.spacing(3)}` } }))}>
            {/* Tab switcher */}
            <div className={css((t) => ({ display: "flex", borderBottom: `1px solid ${t.colors.borderLight}` }))}>
              <button
                className={`${tabBaseClass}${authMode === "login" ? ` ${tabActiveClass}` : ""}`}
                onClick={() => { setAuthMode("login"); setPasskeyError(null); }}
              >
                Sign In
              </button>
              <button
                className={`${tabBaseClass}${authMode === "signup" ? ` ${tabActiveClass}` : ""}`}
                onClick={() => { setAuthMode("signup"); setPasskeyError(null); }}
              >
                Create Account
              </button>
            </div>

            {authMode === "login" ? (
              <>
                <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.88rem", textAlign: "center", lineHeight: "1.5" }))}>
                  Use your passkey to sign in.
                </p>
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
                  🔑 {passkeyLoading ? "Authenticating..." : "Sign in with Passkey"}
                </button>
              </>
            ) : (
              <>
                <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.88rem", textAlign: "center", lineHeight: "1.5" }))}>
                  Create your account with a passkey. You'll connect Gmail after.
                </p>
                <input
                  type="text"
                  placeholder="Your name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !passkeyLoading) handlePasskeySignup(); }}
                  autoFocus
                  className={css((t) => ({
                    padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                    borderRadius: t.radius,
                    border: `1px solid ${t.colors.border}`,
                    fontSize: "0.95rem",
                    outline: "none",
                    transition: "border-color 0.15s",
                    "&:focus": { borderColor: t.colors.primary },
                  }))}
                />
                <button
                  onClick={handlePasskeySignup}
                  disabled={passkeyLoading || !signupName.trim()}
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
                  🔑 {passkeyLoading ? "Creating account..." : "Create Account with Passkey"}
                </button>
              </>
            )}

            {/* Error */}
            {passkeyError && (
              <div className={css((t) => ({ padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, fontSize: "0.85rem", textAlign: "center" }))}>
                {passkeyError}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Logged in but no Gmail connected ---
  if (!gmailConnected && !status?.localDev) {
    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: t.spacing(4), padding: `${t.spacing(5)} ${t.spacing(3)} calc(${t.spacing(5)} + env(safe-area-inset-bottom, 0px))`, boxSizing: "border-box" }))}>
        <h1 className={css((t) => ({ fontSize: "1.5rem", fontWeight: "700", textAlign: "center", lineHeight: "1.2" }))}>📬 Mailania</h1>
        <p className={css((t) => ({ color: t.colors.textMuted, textAlign: "center", maxWidth: "400px", lineHeight: "1.6" }))}>
          Welcome{status?.user?.displayName ? `, ${status.user.displayName}` : ""}! Connect a Gmail account to start triaging your inbox.
        </p>

        {error && (
          <div className={css((t) => ({ padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, fontSize: "0.9rem", textAlign: "center", maxWidth: "420px" }))}>
            {error}
          </div>
        )}

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
          📧 Connect Gmail Account
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
    <ErrorBoundary>
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
    <div className={css((t) => ({
      width: "min(100%, 1400px)",
      maxWidth: "1400px",
      margin: "0 auto",
      padding: `${t.spacing(6)} ${t.spacing(5)}`,
      minWidth: 0,
      boxSizing: "border-box",
      overflowX: "hidden",
      "@media (max-width: 640px)": {
        padding: `${t.spacing(3)} ${t.spacing(2.5)} calc(${t.spacing(20)} + env(safe-area-inset-bottom, 0px))`,
      },
    }))}>
      {/* Header */}
      <header
        className={css((t) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: t.spacing(4),
          marginBottom: t.spacing(5),
          borderBottom: `2px solid ${t.colors.border}`,
          gap: t.spacing(2),
          minWidth: 0,
          flexWrap: "wrap",
          "@media (max-width: 640px)": {
            paddingBottom: t.spacing(3),
            marginBottom: t.spacing(3),
            alignItems: "stretch",
          },
        }))}
      >
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), minWidth: 0, overflow: "visible" }))}>
          <h1 className={css({ fontSize: "1.25rem", fontWeight: "700", flexShrink: 0 })}>
            📬 Mailania
          </h1>
          {status?.user && (
            <span
              className={css((t) => ({
                fontSize: "0.78rem",
                color: t.colors.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                "@media (max-width: 480px)": {
                  display: "none",
                },
              }))}
            >
              {status.user.displayName}
              {status.gmailAccounts && status.gmailAccounts.length > 0 && (
                <> · {status.gmailAccounts.find((a) => a.isActive)?.email}</>
              )}
            </span>
          )}
        </div>
        <div className={css((t) => ({ display: "flex", gap: t.spacing(1.5), flexWrap: "wrap", flexShrink: 1, justifyContent: "flex-end", marginLeft: "auto", "@media (max-width: 640px)": { width: "100%" }, "@media (max-width: 480px)": { gap: t.spacing(0.75) } }))}>
          <button
            onClick={fetchInbox}
            title="Refresh inbox"
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(2.5)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.85rem",
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            <span className={css({ "@media (max-width: 480px)": { display: "none" } })}>↻ Refresh</span>
            <span className={css({ display: "none", "@media (max-width: 480px)": { display: "inline" } })}>↻</span>
          </button>
          <a
            href="/settings"
            title="Account settings"
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(2.5)}`,
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
            <span className={css({ "@media (max-width: 480px)": { display: "none" } })}>⚙️ Account</span>
            <span className={css({ display: "none", "@media (max-width: 480px)": { display: "inline" } })}>⚙️</span>
          </a>
          <button
            onClick={handleLogout}
            title="Sign out"
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(2.5)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: "0.85rem",
              color: t.colors.textMuted,
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            <span className={css({ "@media (max-width: 480px)": { display: "none" } })}>Sign out</span>
            <span className={css({ display: "none", "@media (max-width: 480px)": { display: "inline" } })}>↪</span>
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

      {/* 2-column layout: chat (left/center) + proposal sidebar (right) */}
      <div
        className={css((t) => ({
          display: "flex",
          gap: t.spacing(5),
          alignItems: "flex-start",
          minWidth: 0,
          "@media (max-width: 960px)": {
            flexDirection: "column",
            gap: t.spacing(4),
          },
          "@media (max-width: 640px)": {
            gap: t.spacing(3),
          },
        }))}
      >
        {/* Left column: Chat + Inbox */}
        <div className={css((t) => ({ flex: "1 1 0%", minWidth: 0, width: "100%", maxWidth: "100%", overflow: "hidden", display: "flex", flexDirection: "column", gap: t.spacing(5) }))}>
          {/* General Chat — primary surface */}
          <section>
            <div className={css((t) => ({ marginBottom: t.spacing(3) }))}>
              <h2 className={css({ fontSize: "1.25rem", fontWeight: "700", margin: "0" })}>🗣️ Inbox Chat</h2>
              <p className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, margin: `${t.spacing(1)} 0 0`, lineHeight: "1.5" }))}>
                Ask about your inbox, search mail, refine proposals, or update triage preferences — all from one thread.
              </p>
              {latestTriageSummary && (
                <p
                  className={css((t) => ({
                    fontSize: "0.78rem",
                    color: t.colors.textMuted,
                    margin: `${t.spacing(1.5)} 0 0`,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }))}
                >
                  Latest triage: {latestTriageSummary.suggestionCount} proposal{latestTriageSummary.suggestionCount !== 1 ? "s" : ""} · {new Date(latestTriageSummary.createdAt).toLocaleString()}
                </p>
              )}
            </div>

            <ChatPanel
              title="Chat with Mailania"
              subtitle="Read-only and recommendation-only — it can inspect mail and saved preferences, but it won't change your mailbox from chat."
              messages={generalChatMessages}
              loading={generalChatLoading}
              initLoading={generalChatInitLoading}
              error={generalChatError}
              input={generalChatInput}
              onInputChange={setGeneralChatInput}
              onSend={sendGeneralChatMessage}
              placeholder="Ask about your inbox…"
              emptyState="No messages yet. Start with a broad inbox question or ask Mailania to find a specific email."
              starterPrompts={[
                "What stands out in my inbox right now?",
                "Search for receipts from this month",
                "What triage preferences do you remember?",
                "Summarize the latest triage suggestions",
              ]}
              onMountChange={(mounted) => updateMobileDebug({ chatPanelMounted: mounted })}
            />
          </section>

          {/* Inbox panel — secondary, collapsible */}
          <div>
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
                minWidth: 0,
                gap: t.spacing(2),
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
                  maxHeight: "400px",
                  overflowY: "auto",
                  overflowX: "hidden",
                  scrollbarWidth: "thin",
                  scrollbarColor: "#d1d5db transparent",
                  overscrollBehavior: "contain",
                  "@media (max-width: 640px)": {
                    maxHeight: "320px",
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

        {/* Right column: Proposal Sidebar (hidden on mobile — shown via bottom sheet instead) */}
        <div
          className={css({
            "@media (max-width: 640px)": { display: "none" },
          })}
          style={{ flex: "0 0 auto" }}
        >
          <ProposalSidebar
            messages={messages}
            onAuthLost={() => {
              setStatus((s) => s ? { ...s, authenticated: false } : null);
              setMessages([]);
              setGeneralChatMessages([]);
              setLatestTriageSummary(null);
              setLatestSuggestions(undefined);
            }}
            externalSuggestions={latestSuggestions}
            externalRunId={latestTriageSummary?.runId ?? null}
            externalLastRunAt={latestTriageSummary?.createdAt ?? null}
          />
        </div>
      </div>

      {/* Mobile: fixed bottom-sheet proposals (visible only on mobile) */}
      <MobileProposalSheet
        messages={messages}
        onAuthLost={() => {
          setStatus((s) => s ? { ...s, authenticated: false } : null);
          setMessages([]);
          setGeneralChatMessages([]);
          setLatestTriageSummary(null);
          setLatestSuggestions(undefined);
        }}
        externalSuggestions={latestSuggestions}
        externalRunId={latestTriageSummary?.runId ?? null}
        externalLastRunAt={latestTriageSummary?.createdAt ?? null}
        onMountChange={(mounted) => updateMobileDebug({ mobileProposalSheetMounted: mounted })}
      />
    </div>
      </Route>
    </Switch>
    </Router>
    </ErrorBoundary>
  );
}

// --- Message row styles ---
const msgRowClass = css((t) => ({
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  borderBottom: `1px solid ${t.colors.borderLight}`,
  cursor: "pointer",
  display: "flex",
  alignItems: "flex-start",
  gap: t.spacing(2),
  minHeight: "56px",
  transition: "background 0.15s, border-left-color 0.15s",
  borderLeft: "3px solid transparent",
  overflow: "hidden",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  "&:hover": {
    background: "#eef2ff",
    borderLeftColor: t.colors.primary,
  },
  "&:last-child": { borderBottom: "none" },
  "@media (max-width: 480px)": {
    padding: `${t.spacing(2.25)} ${t.spacing(2.5)}`,
  },
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
  "@media (max-width: 640px)": {
    whiteSpace: "normal",
    display: "-webkit-box",
    "-webkit-line-clamp": 2,
    "-webkit-box-orient": "vertical",
    overflowWrap: "anywhere",
  },
}));

const msgSubjectReadClass = css((t) => ({
  fontSize: "0.88rem",
  fontWeight: "400",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media (max-width: 640px)": {
    whiteSpace: "normal",
    display: "-webkit-box",
    "-webkit-line-clamp": 2,
    "-webkit-box-orient": "vertical",
    overflowWrap: "anywhere",
  },
}));

const msgSnippetUnreadClass = css((t) => ({
  color: t.colors.textMuted,
  fontSize: "0.8rem",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media (max-width: 640px)": {
    whiteSpace: "normal",
    display: "-webkit-box",
    "-webkit-line-clamp": 2,
    "-webkit-box-orient": "vertical",
    overflowWrap: "anywhere",
  },
}));

const msgSnippetReadClass = css((t) => ({
  color: "#9ca3af",
  fontSize: "0.8rem",
  marginTop: t.spacing(0.5),
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media (max-width: 640px)": {
    whiteSpace: "normal",
    display: "-webkit-box",
    "-webkit-line-clamp": 2,
    "-webkit-box-orient": "vertical",
    overflowWrap: "anywhere",
  },
}));

const msgDateClass = css((t) => ({
  color: t.colors.textMuted,
  fontSize: "0.75rem",
  flexShrink: 0,
  whiteSpace: "nowrap",
  "@media (max-width: 480px)": {
    fontSize: "0.72rem",
  },
}));

function MessageRow({ msg }: { msg: InboxMessage }) {
  const isUnread = msg.isRead === false;

  return (
    <div role="listitem" tabIndex={0} className={msgRowClass}>
      <div className={css({ width: "7px", flexShrink: 0, paddingTop: "5px" })}>
        {isUnread && <div className={unreadDotClass} />}
      </div>
      <div className={css({ flex: "1 1 0%", minWidth: 0 })}>
        <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.spacing(2), minWidth: 0, "@media (max-width: 480px)": { alignItems: "flex-start", flexDirection: "column", gap: t.spacing(0.5) } }))}>
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
