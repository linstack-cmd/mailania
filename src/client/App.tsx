import { useState, useEffect, useRef, Component } from "react";
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
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>{this.state.error.message}{"\n"}{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Router, Route, Switch } from "wouter";
import { loginWithPasskey, signupWithPasskey, isPasskeySupported } from "./passkey";
import AccountSettings from "./AccountSettings";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";
import ProposalSidebar from "./ProposalSidebar";
import { MobileSwipePane } from "./MobileSwipePane";
import { updateMobileDebug } from "./mobileDebug";
import {
  isTestUIMode,
  TEST_INBOX_MESSAGES,
  TEST_CHAT_MESSAGES,
  TEST_SUGGESTIONS,
  TEST_STATUS,
} from "./testUIMode";

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

export default function App() {
  const testMode = isTestUIMode();
  const [status, setStatus] = useState<StatusData | null>(testMode ? TEST_STATUS as StatusData : null);
  const [loading, setLoading] = useState(testMode ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [signupName, setSignupName] = useState("");
  const [generalChatMessages, setGeneralChatMessages] = useState<ChatMessageData[]>(testMode ? TEST_CHAT_MESSAGES : []);
  const [generalChatInput, setGeneralChatInput] = useState("");
  const [generalChatLoading, setGeneralChatLoading] = useState(false);
  const [generalChatInitLoading, setGeneralChatInitLoading] = useState(false);
  const [generalChatError, setGeneralChatError] = useState<string | null>(null);
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);
  const [suggestionsWithIds, setSuggestionsWithIds] = useState<Array<{id: string, suggestion: any, status: string}>>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const mentionSuggestions = suggestionsWithIds.map((s) => ({ id: s.id, title: s.suggestion.title, kind: s.suggestion.kind }));
  const chatPanelTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isNarrowHeader, setIsNarrowHeader] = useState(
    () => window.matchMedia("(max-width: 480px)").matches
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => window.matchMedia("(max-width: 640px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsNarrowHeader(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    updateMobileDebug({
      authenticated: status?.authenticated ?? null,
      gmailConnected: status?.gmailConnected ?? null,
      statusUserExists: status?.user ? true : false,
      generalChatMessagesCount: generalChatMessages.length,
      appError: error ?? generalChatError ?? passkeyError ?? null,
      localDev: status?.localDev,
    });
  }, [status, generalChatMessages.length, error, generalChatError, passkeyError]);

  useEffect(() => {
    if (testMode) return; // Skip all API calls in test UI mode
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
          fetchGeneralChat();
        } else {
          setLoading(false);
        }
      })
      .catch((err: any) => {
        const message = err?.message || "Cannot reach server";
        updateMobileDebug({ statusFetch: "error", statusFetchError: message, appError: message });
        setStatus({ authenticated: false });
        setError("Cannot reach server");
        setLoading(false);
      });
  }, []);

  async function fetchGeneralChat() {
    setGeneralChatInitLoading(true);
    setGeneralChatError(null);
    try {
      const res = await fetch("/api/chat/general");

      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        setGeneralChatMessages([]);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load inbox chat");
      }
      const data = await res.json();
      setGeneralChatMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setGeneralChatMessages([]);
      setGeneralChatError("Failed to load inbox chat");
    } finally {
      setGeneralChatInitLoading(false);
      setLoading(false);
    }
  }

  // Derived auth state — declared before any useEffect that references it to avoid TDZ in bundle
  const authenticated = status?.authenticated ?? false;

  // Fetch full suggestions list keyed on suggestionsRefreshKey
  useEffect(() => {
    if (testMode) {
      setSuggestionsWithIds(TEST_SUGGESTIONS);
      setSuggestionsLoading(false);
      setSuggestionsError(null);
      return;
    }
    if (!authenticated) {
      setSuggestionsWithIds([]);
      setSuggestionsLoading(false);
      return;
    }
    
    async function fetchSuggestions() {
      setSuggestionsLoading(true);
      setSuggestionsError(null);
      try {
        const res = await fetch("/api/suggestions");
        if (res.status === 401) {
          setStatus((s) => s ? { ...s, authenticated: false } : null);
          setSuggestionsWithIds([]);
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to load suggestions (${res.status})`);
        }
        const data = await res.json();
        setSuggestionsWithIds(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (err: any) {
        setSuggestionsError(err.message || "Failed to load suggestions");
        setSuggestionsWithIds([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }
    fetchSuggestions();
  }, [suggestionsRefreshKey, testMode, authenticated]);

  async function refreshStatus() {
    if (testMode) return;
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
        fetchGeneralChat();
      }
    } catch (err: any) {
      updateMobileDebug({ statusFetch: "error", statusFetchError: err?.message || "refresh failed" });
    }
  }

  async function sendGeneralChatMessage(explicitMessage?: string) {
    // Determine the message to send
    const msg = explicitMessage?.trim() || generalChatInput.trim();
    
    // For user-initiated sends, require input. For programmatic sends, allow empty.
    if (!explicitMessage && !msg) return;
    
    // Guard against concurrent requests
    if (generalChatLoading) return;

    // Test UI mode: return canned response, never hit the API
    if (testMode) {
      const userMsg: ChatMessageData = {
        id: `test-user-${Date.now()}`,
        role: "user",
        content: msg,
        createdAt: new Date().toISOString(),
      };
      const botMsg: ChatMessageData = {
        id: `test-bot-${Date.now()}`,
        role: "assistant",
        content: "🧪 **Test Mode** — This is a canned response. In production, Mailania would analyze your inbox and respond with real insights. No LLM calls are being made.",
        createdAt: new Date().toISOString(),
      };
      // Only clear input on user-initiated sends
      if (!explicitMessage) {
        setGeneralChatInput("");
      }
      setGeneralChatMessages((prev) => [...prev, userMsg, botMsg]);
      return;
    }

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    // Only clear input on user-initiated sends
    if (!explicitMessage) {
      setGeneralChatInput("");
    }
    setGeneralChatLoading(true);
    setGeneralChatError(null);
    setGeneralChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: msg, createdAt: new Date().toISOString() },
      { id: assistantMsgId, role: "assistant", content: "", createdAt: new Date().toISOString(), streaming: true },
    ]);

    try {
      const res = await fetch("/api/chat/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        setGeneralChatMessages((prev) => prev.filter((m) => m.id !== assistantMsgId && m.id !== userMsgId));
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      // Parse SSE stream
      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = ""; // Buffer for incomplete lines (across chunks)
      let suggestionsChanged = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        textBuffer += decoder.decode(value, { stream: true });
        
        // Process complete events only (SSE events are delimited by double newlines)
        let eventStart = 0;
        let inEvent = false;
        let currentEvent: { type?: string; data?: string } = {};

        for (let i = 0; i < textBuffer.length; i++) {
          const char = textBuffer[i];
          const nextChar = i + 1 < textBuffer.length ? textBuffer[i + 1] : "";

          // Double newline marks end of event
          if (char === "\n" && nextChar === "\n") {
            const eventText = textBuffer.substring(eventStart, i);
            eventStart = i + 2; // Skip both newlines

            // Parse event
            const lines = eventText.split("\n");
            currentEvent = {};

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent.type = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                currentEvent.data = line.slice(6).trim();
              }
            }

            // Process complete event
            if (currentEvent.type && currentEvent.data !== undefined) {
              let data: any;
              try {
                data = JSON.parse(currentEvent.data);
              } catch (parseErr: any) {
                console.error("Failed to parse SSE data:", parseErr, "raw data:", currentEvent.data);
                currentEvent = {};
                continue;
              }

              // Handle event based on type
              if (currentEvent.type === "token" && data.text) {
                // Append token to streaming message
                setGeneralChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + data.text }
                      : m
                  )
                );
              } else if (currentEvent.type === "tool_start") {
                // Clear content on tool start (client ignores pre-tool text)
                setGeneralChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: "" }
                      : m
                  )
                );
              } else if (currentEvent.type === "status") {
                // Display tool status separately
                if (data.tool) {
                  setGeneralChatMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, toolStatus: `⚙️ ${data.tool}` }
                        : m
                    )
                  );
                }
              } else if (currentEvent.type === "done") {
                // Finalize message with complete text and clear tool status
                suggestionsChanged = data.suggestionsChanged || false;
                setGeneralChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: data.assistantText, streaming: false, toolStatus: undefined }
                      : m
                  )
                );
              } else if (currentEvent.type === "error") {
                throw new Error(data.message || "Stream error");
              }
            }
            currentEvent = {};
          }
        }

        // Keep remaining incomplete data for next iteration
        textBuffer = textBuffer.substring(eventStart);
      }

      // If suggestions changed, refresh them
      if (suggestionsChanged) {
        setSuggestionsRefreshKey((k) => k + 1);
      }
    } catch (err: any) {
      setGeneralChatError(err.message || "Failed to send message");
      setGeneralChatMessages((prev) => prev.filter((m) => m.id !== assistantMsgId && m.id !== userMsgId));
    } finally {
      setGeneralChatLoading(false);
    }
  }

  async function dismissSuggestion(id: string) {
    try {
      const res = await fetch(`/api/suggestions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to dismiss suggestion (${res.status})`);
      }
      // Remove from local list
      setSuggestionsWithIds((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setSuggestionsError(err.message || "Failed to dismiss suggestion");
    }
  }

  async function acceptSuggestion(id: string) {
    try {
      const res = await fetch(`/api/suggestions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to accept suggestion (${res.status})`);
      }
      // Remove from local list
      setSuggestionsWithIds((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setSuggestionsError(err.message || "Failed to accept suggestion");
    }
  }

  function handleSuggestionNotification(title: string, status: "accepted" | "dismissed") {
    const message = status === "accepted"
      ? `I accepted the suggestion: "${title}"`
      : `I dismissed the suggestion: "${title}"`;
    sendGeneralChatMessage(message);
  }

  async function handleLogout() {
    if (testMode) return;
    await fetch("/auth/logout");
    setStatus({ authenticated: false });
    setGeneralChatMessages([]);
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

  // Handle mention suggestion from proposal cards
  function handleMentionSuggestion({ id, title }: { id: string; title: string }) {
    const mentionText = `@[${title}](${id})`;
    const trimmedCurrent = generalChatInput.trimStart();
    const newInput = trimmedCurrent ? `${trimmedCurrent} ${mentionText} ` : `${mentionText} `;
    setGeneralChatInput(newInput);
    // Focus the textarea
    setTimeout(() => {
      chatPanelTextareaRef.current?.focus();
      // Position cursor at end
      if (chatPanelTextareaRef.current) {
        chatPanelTextareaRef.current.selectionStart = newInput.length;
        chatPanelTextareaRef.current.selectionEnd = newInput.length;
      }
    }, 0);
  }

  const gmailConnected = status?.gmailConnected ?? false;

  // --- Loading state ---
  if (status === null || (loading && authenticated)) {
    return (
      <div className={css((t) => ({ maxWidth: "1400px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(4)}`, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }))}>
        <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.sm }))}>Loading…</p>
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
      fontSize: t.fontSize.sm,
      cursor: "pointer",
      minHeight: "44px",
      transition: "color 0.15s, border-color 0.15s",
      "&:hover": { color: "#d946a6" },
      "&:focus-visible": { outline: `2px solid #d946a6`, outlineOffset: "-2px" },
    }));
    const tabActiveClass = css((t) => ({
      borderBottomColor: "#d946a6",
      color: "#d946a6",
      fontWeight: "700",
    }));

    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: t.spacing(4), padding: `${t.spacing(5)} ${t.spacing(3)} calc(${t.spacing(5)} + env(safe-area-inset-bottom, 0px))`, boxSizing: "border-box", background: "linear-gradient(135deg, #fce4ec 0%, #f3e5f5 25%, #ede7f6 50%, #e0f2f1 75%, #f0f9ff 100%)" }))}>
        {!isPasskeySupported() ? (
          <div className={css((t) => ({ textAlign: "center", maxWidth: "360px", padding: t.spacing(4) }))}>
            <p className={css((t) => ({ color: t.colors.error, fontSize: t.fontSize.sm, lineHeight: "1.6" }))}>
              Your browser does not support passkeys. Mailania requires a browser with WebAuthn support (Chrome, Safari, Firefox, Edge).
            </p>
          </div>
        ) : (
          <div className={css((t) => ({ width: "min(100%, 420px)", display: "flex", flexDirection: "column", gap: t.spacing(3), padding: `${t.spacing(4)} ${t.spacing(4.5)}`, border: `1px solid ${t.colors.borderLight}`, borderRadius: t.radius, background: t.colors.bg, boxShadow: t.shadow, boxSizing: "border-box", "@media (max-width: 480px)": { padding: `${t.spacing(3.5)} ${t.spacing(3)}` } }))}>
            {/* Logomark above branding */}
            <div style={{display: "flex", justifyContent: "center", marginBottom: "16px"}}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d946a6" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="12" fill="url(#logoBg)"/>
                <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="26">✨</text>
              </svg>
            </div>
            {/* Branding inside card */}
            <h1 className={css((t) => ({ fontSize: t.fontSize.xl, fontWeight: t.fontWeight.bold, textAlign: "center", margin: "0 0 0.5rem", lineHeight: "1.2", letterSpacing: "-0.02em" }))}>Mailania</h1>

            <p className="login-subtitle">
              AI-powered email management — triage your inbox, accept suggestions, and let your assistant handle the rest.
            </p>

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
                <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.sm, textAlign: "center", lineHeight: t.lineHeight.normal }))}>
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
                    background: t.gradients.button,
                    color: "#fff",
                    borderRadius: t.radius,
                    border: "none",
                    fontWeight: "600",
                    fontSize: t.fontSize.base,
                    cursor: "pointer",
                    minHeight: "44px",
                    transition: "background 0.15s",
                    "&:hover:not(:disabled)": { opacity: 0.9 },
                    "&:focus-visible": { outline: `2px solid #d946a6`, outlineOffset: "2px" },
                    "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
                  }))}
                >
                  {passkeyLoading && <span className="spinner" />}
                  {passkeyLoading ? "Authenticating…" : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 0, verticalAlign: "middle"}}><circle cx="8" cy="8" r="4"/><path d="M12 8h8m-4-4v8"/></svg>
                      Sign in with Passkey
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.sm, textAlign: "center", lineHeight: t.lineHeight.normal }))}>
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
                    fontSize: t.fontSize.base,
                    outline: "none",
                    transition: "border-color 0.15s",
                    "&:focus": { borderColor: t.colors.primary },
                    "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "-2px" },
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
                    background: t.gradients.button,
                    color: "#fff",
                    borderRadius: t.radius,
                    border: "none",
                    fontWeight: "600",
                    fontSize: t.fontSize.base,
                    cursor: "pointer",
                    minHeight: "44px",
                    transition: "background 0.15s",
                    "&:hover:not(:disabled)": { opacity: 0.9 },
                    "&:focus-visible": { outline: `2px solid #d946a6`, outlineOffset: "2px" },
                    "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
                  }))}
                >
                  {passkeyLoading && <span className="spinner" />}
                  {passkeyLoading ? "Creating account…" : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 0, verticalAlign: "middle"}}><circle cx="8" cy="8" r="4"/><path d="M12 8h8m-4-4v8"/></svg>
                      Create Account with Passkey
                    </>
                  )}
                </button>
              </>
            )}

            {/* Error */}
            {passkeyError && (
              <div className={css((t) => ({ padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, fontSize: t.fontSize.xs, textAlign: "center" }))}>
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
        <h1 className={css((t) => ({ fontSize: t.fontSize.xl, fontWeight: "700", textAlign: "center", lineHeight: "1.2" }))}>Mailania</h1>
        <p className={css((t) => ({ color: t.colors.textMuted, textAlign: "center", maxWidth: "400px", lineHeight: "1.6" }))}>
          Welcome{status?.user?.displayName ? `, ${status.user.displayName}` : ""}! Connect a Gmail account to start triaging your inbox.
        </p>

        {error && (
          <div className={css((t) => ({ padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, fontSize: t.fontSize.sm, textAlign: "center", maxWidth: "420px" }))}>
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
            background: t.gradients.button,
            color: "#fff",
            borderRadius: t.radius,
            textDecoration: "none",
            fontWeight: "600",
            fontSize: t.fontSize.base,
            transition: "background 0.15s",
            "&:hover": { opacity: 0.9 },
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
            fontSize: t.fontSize.xs,
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
  if (isMobileViewport) {
    // Mobile layout with swipe panes
    return (
      <ErrorBoundary>
      <Router>
      <Switch>
        <Route path="/settings">
          <AccountSettings
            status={status}
            onBack={() => window.history.back()}
            onStatusChange={refreshStatus}
          />
        </Route>
        <Route>
          <MobileSwipePane
            messages={generalChatMessages}
            loading={generalChatLoading}
            initLoading={generalChatInitLoading}
            error={generalChatError}
            input={generalChatInput}
            onInputChange={setGeneralChatInput}
            onSend={sendGeneralChatMessage}
            mentionSuggestions={mentionSuggestions}
            textareaRef={chatPanelTextareaRef}
            suggestionsWithIds={suggestionsWithIds}
            suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            onDismissSuggestion={dismissSuggestion}
            onAcceptSuggestion={acceptSuggestion}
            onMentionSuggestion={handleMentionSuggestion}
            onSuggestionNotification={handleSuggestionNotification}
            inboxMessages={[]}
            status={status}
            testMode={testMode}
          />
        </Route>
      </Switch>
      </Router>
      </ErrorBoundary>
    );
  }

  // Desktop layout
  return (
    <ErrorBoundary>
    <Router>
    <Switch>
      <Route path="/settings">
        <AccountSettings
          status={status}
          onBack={() => window.history.back()}
          onStatusChange={refreshStatus}
        />
      </Route>
      <Route>
    <div className={css((t) => ({
      width: "100%",
      maxWidth: "1280px",
      margin: "0 auto",
      padding: `${t.spacing(8)} ${t.spacing(8)}`,
      minWidth: 0,
      boxSizing: "border-box",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: t.spacing(6),
      minHeight: "100vh",
    }))}>
      {/* Header */}
      <header
        className={css((t) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: t.spacing(4),
          paddingRight: t.spacing(4),
          gap: t.spacing(4),
          minWidth: 0,
        }))}
      >
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(3.5), minWidth: 0, overflow: "visible" }))}>
          <div className={css((t) => ({ 
            width: "44px",
            height: "44px",
            background: t.gradients.logo,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            fontWeight: "700",
            color: "white",
            boxShadow: "0 6px 20px rgba(217, 70, 166, 0.25)",
            flexShrink: 0,
          }))}>
            ✨
          </div>
          <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), minWidth: 0 }))}>
            <h1 className={css((t) => ({ 
              fontSize: "28px", 
              fontWeight: "700", 
              flexShrink: 0, 
              margin: 0, 
              background: t.gradients.headerText,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }))}>
              Mailania
            </h1>
            {testMode && (
              <span className={css((t) => ({ fontSize: t.fontSize.xs, fontWeight: "700", textTransform: "uppercase", padding: `${t.spacing(0.5)} ${t.spacing(1.5)}`, borderRadius: "999px", background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", letterSpacing: "0.05em" }))}>
                TEST
              </span>
            )}
          </div>
        </div>
        <div className={css((t) => ({ display: "flex", gap: t.spacing(3), flexShrink: 1, justifyContent: "flex-end", marginLeft: "auto" }))}>
          <a
            href="/settings"
            title="Account settings"
            className={css((t) => ({
              width: "40px",
              height: "40px",
              background: t.gradients.avatarUser,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: t.fontSize.base,
              textDecoration: "none",
              color: "white",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "600",
              minHeight: "40px",
              minWidth: "40px",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 12px rgba(167, 139, 250, 0.3)",
              "&:hover": { transform: "scale(1.08)", boxShadow: "0 6px 16px rgba(167, 139, 250, 0.4)" },
              "&:focus-visible": { outline: "none" },
            }))}
          >
            {status?.user?.displayName?.charAt(0).toUpperCase() || "A"}
          </a>
          <button
            onClick={handleLogout}
            title="Sign out"
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: "16px",
              background: "rgba(217, 70, 166, 0.08)",
              cursor: "pointer",
              fontSize: t.fontSize.xs,
              color: "#d946a6",
              fontWeight: "600",
              minHeight: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.3s ease",
              "&:hover": { background: "rgba(217, 70, 166, 0.15)" },
              "&:focus-visible": { outline: "none" },
            }))}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Test Mode Banner */}
      {testMode && (
        <div
          className={css((t) => ({
            padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            borderRadius: t.radius,
            marginBottom: t.spacing(4),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: t.spacing(2),
            border: "2px dashed #f59e0b",
            fontSize: t.fontSize.sm,
            fontWeight: t.fontWeight.semibold,
            color: "#92400e",
          }))}
        >
          <span style={{ fontSize: "1.2rem" }}>🧪</span>
          <span>Test Mode — Viewing mock data only. No real emails, no LLM calls.</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={css((t) => ({ padding: t.spacing(4), background: "#fef2f2", borderRadius: t.radius, color: t.colors.error, marginBottom: t.spacing(4), display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(3) }))}>
          <span>{error}</span>
          <button
            onClick={async () => {
              await refreshStatus();
              setError(null);
            }}
            className={css((t) => ({
              padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.error}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.error,
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: t.fontWeight.semibold,
              flexShrink: 0,
              "&:hover": { background: "rgba(239,68,68,0.08)" },
            }))}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content: grid layout for desktop */}
      <div
        className={css((t) => ({
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: t.spacing(6),
          alignItems: "flex-start",
          minWidth: 0,
          flex: 1,
          minHeight: 0,
          "@media (max-width: 960px)": {
            gridTemplateColumns: "1fr",
            gap: t.spacing(4),
          },
        }))}
      >
        {/* Left column: Chat area */}
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
          mentionSuggestions={mentionSuggestions}
          textareaRef={chatPanelTextareaRef}
        />

        {/* Right column: Proposal Sidebar */}
        <ProposalSidebar
          suggestionsWithIds={suggestionsWithIds}
          suggestionsLoading={suggestionsLoading}
          suggestionsError={suggestionsError}
          onDismissSuggestion={dismissSuggestion}
          onAcceptSuggestion={acceptSuggestion}
          onMentionSuggestion={handleMentionSuggestion}
          onSuggestionNotification={handleSuggestionNotification}
        />
      </div>
    </div>
      </Route>
    </Switch>
    </Router>
    </ErrorBoundary>
  );
}


