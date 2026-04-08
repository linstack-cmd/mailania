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
import MobileProposalSheet from "./MobileProposalSheet";
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
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{id: string, title: string, kind: string}>>([]);
  const chatPanelTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isNarrowHeader, setIsNarrowHeader] = useState(
    () => window.matchMedia("(max-width: 480px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsNarrowHeader(e.matches);
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
    }
  }

  // Derived auth state — declared before any useEffect that references it to avoid TDZ in bundle
  const authenticated = status?.authenticated ?? false;

  // Fetch mention suggestions keyed on suggestionsRefreshKey
  useEffect(() => {
    if (testMode) {
      setMentionSuggestions(TEST_SUGGESTIONS.map((s) => ({ id: s.id, title: s.suggestion.title, kind: s.suggestion.kind })));
      return;
    }
    if (!authenticated) return;
    async function fetchMentionSuggestions() {
      try {
        const res = await fetch("/api/suggestions");
        if (!res.ok) return;
        const data = await res.json();
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        setMentionSuggestions(
          suggestions.map((s: any) => ({
            id: s.id,
            title: s.suggestion?.title || "",
            kind: s.suggestion?.kind || "",
          }))
        );
      } catch {
        setMentionSuggestions([]);
      }
    }
    fetchMentionSuggestions();
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
      "&:hover": { color: t.colors.primary },
      "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "-2px" },
    }));
    const tabActiveClass = css((t) => ({
      borderBottomColor: t.colors.primary,
      color: t.colors.primary,
      fontWeight: "700",
    }));

    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: t.spacing(4), padding: `${t.spacing(5)} ${t.spacing(3)} calc(${t.spacing(5)} + env(safe-area-inset-bottom, 0px))`, boxSizing: "border-box", background: "linear-gradient(135deg, #f0f4ff, #e8edf8)" }))}>
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
                <rect width="48" height="48" rx="12" fill="#4f46e5"/>
                <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="26">M</text>
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
                    background: t.colors.primary,
                    color: "#fff",
                    borderRadius: t.radius,
                    border: "none",
                    fontWeight: "600",
                    fontSize: t.fontSize.base,
                    cursor: "pointer",
                    minHeight: "44px",
                    transition: "background 0.15s",
                    "&:hover:not(:disabled)": { background: t.colors.primaryHover },
                    "&:focus-visible": { outline: `2px solid #4f46e5`, outlineOffset: "2px" },
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
                    background: t.colors.primary,
                    color: "#fff",
                    borderRadius: t.radius,
                    border: "none",
                    fontWeight: "600",
                    fontSize: t.fontSize.base,
                    cursor: "pointer",
                    minHeight: "44px",
                    transition: "background 0.15s",
                    "&:hover:not(:disabled)": { background: t.colors.primaryHover },
                    "&:focus-visible": { outline: `2px solid #4f46e5`, outlineOffset: "2px" },
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
            background: t.colors.primary,
            color: "#fff",
            borderRadius: t.radius,
            textDecoration: "none",
            fontWeight: "600",
            fontSize: t.fontSize.base,
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
      maxWidth: "1400px",
      margin: "0 auto",
      padding: `${t.spacing(6)} ${t.spacing(5)}`,
      minWidth: 0,
      boxSizing: "border-box",
      overflowX: "hidden",
      "@media (max-width: 640px)": {
        padding: `${t.spacing(3)} ${t.spacing(2.5)} calc(${t.spacing(20)} + env(safe-area-inset-bottom, 0px))`,
        maxWidth: "100vw",
      },
      "@media (max-width: 360px)": {
        padding: `${t.spacing(2)} ${t.spacing(2)} calc(${t.spacing(10)} + env(safe-area-inset-bottom, 0px))`,
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
          <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(1.5) }))}>
            <h1 className={css((t) => ({ fontSize: t.fontSize.xl, fontWeight: t.fontWeight.bold, flexShrink: 0, margin: 0 }))}>
              Mailania
            </h1>
            {testMode && (
              <span className={css((t) => ({ fontSize: t.fontSize.xs, fontWeight: "700", textTransform: "uppercase", padding: `${t.spacing(0.5)} ${t.spacing(1.5)}`, borderRadius: "999px", background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", letterSpacing: "0.05em" }))}>
                TEST
              </span>
            )}
          </div>
          {status?.user && (
            <span
              className={css((t) => ({
                fontSize: t.fontSize.xs,
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

          <a
            href="/settings"
            title="Account settings"
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(2.5)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: t.colors.bg,
              cursor: "pointer",
              fontSize: t.fontSize.xs,
              textDecoration: "none",
              color: t.colors.text,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: t.spacing(1),
              minHeight: "44px",
              minWidth: "44px",
              transition: "background 0.15s",
              "&:hover": { background: t.colors.borderLight },
              "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
            }))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0}}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            {!isNarrowHeader && "Account"}
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
              fontSize: t.fontSize.xs,
              color: t.colors.textMuted,
              minHeight: "44px",
              minWidth: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s, color 0.15s",
              "&:hover": { background: t.colors.borderLight, color: t.colors.text },
              "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
            }))}
          >
            {isNarrowHeader ? "↪" : "Sign out"}
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
        {/* Left column: Chat (now full width on all devices, inbox removed per Fix 1) */}
        <div className={css((t) => ({ flex: "1 1 0%", minWidth: 0, width: "100%", maxWidth: "100%", overflow: "hidden", display: "flex", flexDirection: "column", gap: t.spacing(5), borderRight: `1px solid ${t.colors.border}`, "@media (max-width: 960px)": { borderRight: "none" } }))}>
          {/* General Chat — primary surface */}
          <section className={css((t) => ({ display: "flex", flexDirection: "column", flex: "1", minHeight: 0 }))}>
            <div className={css((t) => ({ marginBottom: t.spacing(3), display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: t.spacing(3) }))}>
              <div>
                <h2 className={css((t) => ({ fontSize: t.fontSize.lg, fontWeight: t.fontWeight.bold, margin: "0", display: "flex", alignItems: "center", gap: t.spacing(1.5) }))}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0,verticalAlign:"middle"}} aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Inbox Chat
                </h2>
                <p className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted, margin: `${t.spacing(1)} 0 0`, lineHeight: t.lineHeight.normal }))}>
                  Ask about your inbox, search mail, refine proposals, or update triage preferences — all from one thread.
                </p>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/chat", { method: "DELETE" });
                    if (res.ok) {
                      setGeneralChatMessages([]);
                    }
                  } catch (err) {
                    console.error("Failed to clear chat:", err);
                  }
                }}
                title="Clear chat history"
                className={css((t) => ({
                  padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
                  border: "none",
                  background: "transparent",
                  color: t.colors.textMuted,
                  fontSize: t.fontSize.xs,
                  cursor: "pointer",
                  borderRadius: t.radiusSm,
                  whiteSpace: "nowrap",
                  transition: "background 0.15s, color 0.15s",
                  minHeight: "44px",
                  "&:hover": { background: t.colors.bgAlt, color: t.colors.text },
                  "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "-2px" },
                }))}
              >
                Clear chat
              </button>
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
              mentionSuggestions={mentionSuggestions}
              textareaRef={chatPanelTextareaRef}
            />
          </section>
        </div>

        {/* Right column: Proposal Sidebar (hidden on mobile — shown via bottom sheet instead) */}
        <div
          className={css({
            width: "340px",
            maxWidth: "340px",
            flexShrink: 0,
            "@media (max-width: 960px)": { width: "100%", maxWidth: "100%" },
            "@media (max-width: 640px)": { display: "none" },
          })}
        >
          <ProposalSidebar
            onAuthLost={() => {
              setStatus((s) => s ? { ...s, authenticated: false } : null);
              setGeneralChatMessages([]);
            }}
            refreshKey={suggestionsRefreshKey}
            onMentionSuggestion={handleMentionSuggestion}
            onSuggestionNotification={handleSuggestionNotification}
          />
        </div>
      </div>

      {/* Mobile: fixed bottom-sheet proposals (visible only on mobile) */}
      <MobileProposalSheet
        onAuthLost={() => {
          setStatus((s) => s ? { ...s, authenticated: false } : null);
          setGeneralChatMessages([]);
        }}
        refreshKey={suggestionsRefreshKey}
        onMountChange={(mounted) => updateMobileDebug({ mobileProposalSheetMounted: mounted })}
        onMentionSuggestion={handleMentionSuggestion}
        onSuggestionNotification={handleSuggestionNotification}
      />
    </div>
      </Route>
    </Switch>
    </Router>
    </ErrorBoundary>
  );
}


