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
import { Router, Route, Switch, useLocation } from "wouter";
import { loginWithPasskey, signupWithPasskey, isPasskeySupported } from "./passkey";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";
import ProposalSidebar from "./ProposalSidebar";
import { MobileLayout } from "./MobileLayout";
import { DesktopLayout, DesktopLayoutWithPile } from "./DesktopLayout";
import { TodayCard } from "./TodayCard";
import { updateMobileDebug } from "./mobileDebug";
import {
  isTestUIMode,
  TEST_CHAT_MESSAGES,
  TEST_SUGGESTIONS,
  TEST_STATUS,
} from "./testUIMode";
import { ConnectGmailScreen, PreferencesScreen } from "./OnboardingScreens";
import { SettingsScreen } from "./SettingsScreen";
import { PileScreen, type Suggestion } from "./PileScreen";
import { DetailScreen } from "./DetailScreen";

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

// --- Skeleton shimmer (glass-tinted white) ---
const skeletonLineClass = css({
  borderRadius: "4px",
  background: "linear-gradient(90deg, rgba(255,255,255,0.3) 25%, rgba(255,255,255,0.6), rgba(255,255,255,0.3) 75%)",
  backgroundSize: "200px 100%",
  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
});

function SkeletonLine({ width = "100%", height = "12px" }: { width?: string; height?: string }) {
  return <div className={skeletonLineClass} style={{ width, height }} />;
}

// --- Route wrapper components (proper React components so useLocation works) ---
// These must be real components (not inline callbacks) to satisfy Rules of Hooks.

// Helper to compute kind summary from suggestions
function computeKindSummary(suggestionsWithIds: Array<{id: string, suggestion: any, status: string}>): string {
  if (suggestionsWithIds.length === 0) return "";
  
  const kindMap: Record<string, string> = {
    archive_bulk: "archive",
    create_filter: "filter",
    needs_user_input: "reply",
    mark_read_bulk: "digest",
  };
  
  const uniqueKinds = new Set<string>();
  for (const { suggestion } of suggestionsWithIds) {
    const kind = suggestion?.kind;
    const label = kindMap[kind];
    if (label) {
      uniqueKinds.add(label);
    }
  }
  
  const kindsList = Array.from(uniqueKinds);
  return kindsList.length > 0 ? kindsList.join(" · ") : "";
}

// Mock email previews for detail screen
const MOCK_EMAIL_PREVIEWS = [
  {
    id: "email-1",
    from: "promotions@mountainwarehouse.com",
    subject: "50% or More Off Everything",
    preview: "Limited time offer on all outdoor apparel and gear. Shop now and save big on summer collections.",
    isArchived: false,
  },
  {
    id: "email-2",
    from: "deals@mountainwarehouse.com",
    subject: "Flash Sale: Final 24 Hours",
    preview: "Don't miss out! Our biggest sale of the season ends tonight. Stock up on essentials.",
    isArchived: false,
  },
  {
    id: "email-3",
    from: "promotions@mountainwarehouse.com",
    subject: "We Miss You - 40% Off",
    preview: "Come back and shop with us. We're offering exclusive discounts just for returning customers.",
    isArchived: true,
  },
  {
    id: "email-4",
    from: "newsletter@mountainwarehouse.com",
    subject: "New Arrivals: Spring Collection",
    preview: "Fresh styles have arrived. Explore our latest spring and summer outdoor collections.",
    isArchived: false,
  },
  {
    id: "email-5",
    from: "promotions@mountainwarehouse.com",
    subject: "Clearance Event Now Live",
    preview: "Seasonal clearance with savings up to 60%. Limited stock on select items.",
    isArchived: true,
  },
  {
    id: "email-6",
    from: "support@mountainwarehouse.com",
    subject: "Order Confirmation #MW-123456",
    preview: "Thank you for your purchase. Your order has been confirmed and is being prepared.",
    isArchived: false,
  },
];

interface MobilePileDetailRouteProps {
  params: { id?: string };
  suggestionsWithIds: Array<{id: string, suggestion: any, status: string}>;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
}
function MobilePileDetailRoute({ params, suggestionsWithIds, acceptSuggestion, dismissSuggestion }: MobilePileDetailRouteProps) {
  const [, setLocation] = useLocation();
  const suggestionId = params.id || "";
  const suggestion = suggestionsWithIds.find((s) => s.id === suggestionId)?.suggestion;
  return (
    <DetailScreen
      ruleTitle={suggestion?.title || "Unknown Rule"}
      ruleDescription={suggestion?.subtitle}
      emailPreviews={MOCK_EMAIL_PREVIEWS}
      isLoading={false}
      onApprove={() => { acceptSuggestion(suggestionId); setLocation("/pile"); }}
      onDismiss={() => { dismissSuggestion(suggestionId); setLocation("/pile"); }}
      onBack={() => setLocation("/pile")}
      isMobileView={true}
    />
  );
}

interface MobilePileRouteProps {
  pileScreenSuggestions: import("./PileScreen").Suggestion[];
  suggestionsLoading: boolean;
  acceptSuggestion: (id: string) => void;
}
function MobilePileRoute({ pileScreenSuggestions, suggestionsLoading, acceptSuggestion }: MobilePileRouteProps) {
  const [, setLocation] = useLocation();
  return (
    <PileScreen
      suggestions={pileScreenSuggestions}
      isLoading={suggestionsLoading}
      onApproveSuggestion={acceptSuggestion}
      onViewDetail={(id) => setLocation(`/pile/${id}`)}
      onBack={() => setLocation("/")}
      isMobileView={true}
    />
  );
}

interface MobileHomeRouteProps {
  generalChatMessages: import("./ChatPanel").ChatMessageData[];
  generalChatLoading: boolean;
  generalChatInitLoading: boolean;
  generalChatError: string | null;
  generalChatInput: string;
  setGeneralChatInput: (v: string) => void;
  sendGeneralChatMessage: (msg?: string) => void;
  mentionSuggestions: Array<{id: string, title: string, kind: string}>;
  chatPanelTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  suggestionsWithIds: Array<{id: string, suggestion: any, status: string}>;
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  status: any;
  testMode: boolean;
  generalChatHasMore: boolean;
  generalChatPaginationLoading: boolean;
  fetchMoreGeneralChat: (beforeId: string) => void;
  pileCount: number;
  userName: string | undefined;
}
function MobileHomeRoute(props: MobileHomeRouteProps) {
  const [, setLocation] = useLocation();
  return (
    <MobileLayout
      messages={props.generalChatMessages}
      loading={props.generalChatLoading}
      initLoading={props.generalChatInitLoading}
      error={props.generalChatError}
      input={props.generalChatInput}
      onInputChange={props.setGeneralChatInput}
      onSend={props.sendGeneralChatMessage}
      mentionSuggestions={props.mentionSuggestions}
      textareaRef={props.chatPanelTextareaRef}
      suggestionsWithIds={props.suggestionsWithIds}
      suggestionsLoading={props.suggestionsLoading}
      suggestionsError={props.suggestionsError}
      inboxMessages={[]}
      status={props.status}
      testMode={props.testMode}
      hasMore={props.generalChatHasMore}
      paginationLoading={props.generalChatPaginationLoading}
      onLoadMore={props.fetchMoreGeneralChat}
      todayCardElement={
        <TodayCard
          pileCount={props.pileCount}
          userName={props.userName}
          kindSummary={computeKindSummary(props.suggestionsWithIds)}
          lastTriageMessages={undefined}
          lastTriageSuggestions={undefined}
          onViewPile={() => setLocation("/pile")}
        />
      }
    />
  );
}

// Desktop route wrappers
interface DesktopPileDetailRouteProps {
  params: { id?: string };
  suggestionsWithIds: Array<{id: string, suggestion: any, status: string}>;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => Promise<void>;
  generalChatMessages: import("./ChatPanel").ChatMessageData[];
  generalChatLoading: boolean;
  generalChatInitLoading: boolean;
  generalChatError: string | null;
  generalChatInput: string;
  setGeneralChatInput: (v: string) => void;
  sendGeneralChatMessage: (msg?: string) => void;
  mentionSuggestions: Array<{id: string, title: string, kind: string}>;
  chatPanelTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  dismissSuggestion2: (id: string) => Promise<void>;
  handleMentionSuggestion: (args: {id: string, title: string}) => void;
  handleSuggestionNotification: (title: string, status: "accepted" | "dismissed") => void;
  status: any;
  testMode: boolean;
  generalChatHasMore: boolean;
  generalChatPaginationLoading: boolean;
  fetchMoreGeneralChat: (beforeId: string) => void;
  handleLogout: () => void;
  userName: string | undefined;
}
function DesktopPileDetailRoute(props: DesktopPileDetailRouteProps) {
  const [, setLocation] = useLocation();
  const suggestionId = props.params.id || "";
  const suggestion = props.suggestionsWithIds.find((s) => s.id === suggestionId)?.suggestion;
  return (
    <DesktopLayoutWithPile
      layout="detail"
      detailScreenProps={{
        ruleTitle: suggestion?.title || "Unknown Rule",
        ruleDescription: suggestion?.subtitle,
        emailPreviews: MOCK_EMAIL_PREVIEWS,
        isLoading: false,
        onApprove: () => { props.acceptSuggestion(suggestionId); setLocation("/pile"); },
        onDismiss: () => { props.dismissSuggestion(suggestionId); setLocation("/pile"); },
        onBack: () => setLocation("/pile"),
      }}
      messages={props.generalChatMessages}
      loading={props.generalChatLoading}
      initLoading={props.generalChatInitLoading}
      error={props.generalChatError}
      input={props.generalChatInput}
      onInputChange={props.setGeneralChatInput}
      onSend={props.sendGeneralChatMessage}
      mentionSuggestions={props.mentionSuggestions}
      textareaRef={props.chatPanelTextareaRef}
      suggestionsWithIds={props.suggestionsWithIds}
      suggestionsLoading={props.suggestionsLoading}
      suggestionsError={props.suggestionsError}
      onDismissSuggestion={props.dismissSuggestion2}
      onAcceptSuggestion={props.acceptSuggestion}
      onMentionSuggestion={props.handleMentionSuggestion}
      onSuggestionNotification={props.handleSuggestionNotification}
      status={props.status}
      testMode={props.testMode}
      hasMore={props.generalChatHasMore}
      paginationLoading={props.generalChatPaginationLoading}
      onLoadMore={props.fetchMoreGeneralChat}
      onLogout={props.handleLogout}
      onNavigate={() => {}}
      userName={props.userName}
    />
  );
}

interface DesktopPileRouteProps {
  pileScreenSuggestions: import("./PileScreen").Suggestion[];
  suggestionsLoading: boolean;
  acceptSuggestion: (id: string) => void;
  generalChatMessages: import("./ChatPanel").ChatMessageData[];
  generalChatLoading: boolean;
  generalChatInitLoading: boolean;
  generalChatError: string | null;
  generalChatInput: string;
  setGeneralChatInput: (v: string) => void;
  sendGeneralChatMessage: (msg?: string) => void;
  mentionSuggestions: Array<{id: string, title: string, kind: string}>;
  chatPanelTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  suggestionsWithIds: Array<{id: string, suggestion: any, status: string}>;
  suggestionsError: string | null;
  dismissSuggestion: (id: string) => Promise<void>;
  handleMentionSuggestion: (args: {id: string, title: string}) => void;
  handleSuggestionNotification: (title: string, status: "accepted" | "dismissed") => void;
  status: any;
  testMode: boolean;
  generalChatHasMore: boolean;
  generalChatPaginationLoading: boolean;
  fetchMoreGeneralChat: (beforeId: string) => void;
  handleLogout: () => void;
  userName: string | undefined;
}
function DesktopPileRoute(props: DesktopPileRouteProps) {
  const [, setLocation] = useLocation();
  return (
    <DesktopLayoutWithPile
      layout="pile"
      pileScreenProps={{
        suggestions: props.pileScreenSuggestions,
        isLoading: props.suggestionsLoading,
        onApproveSuggestion: props.acceptSuggestion,
        onViewDetail: (id) => setLocation(`/pile/${id}`),
        onBack: () => setLocation("/"),
      }}
      messages={props.generalChatMessages}
      loading={props.generalChatLoading}
      initLoading={props.generalChatInitLoading}
      error={props.generalChatError}
      input={props.generalChatInput}
      onInputChange={props.setGeneralChatInput}
      onSend={props.sendGeneralChatMessage}
      mentionSuggestions={props.mentionSuggestions}
      textareaRef={props.chatPanelTextareaRef}
      suggestionsWithIds={props.suggestionsWithIds}
      suggestionsLoading={props.suggestionsLoading}
      suggestionsError={props.suggestionsError}
      onDismissSuggestion={props.dismissSuggestion}
      onAcceptSuggestion={props.acceptSuggestion}
      onMentionSuggestion={props.handleMentionSuggestion}
      onSuggestionNotification={props.handleSuggestionNotification}
      status={props.status}
      testMode={props.testMode}
      hasMore={props.generalChatHasMore}
      paginationLoading={props.generalChatPaginationLoading}
      onLoadMore={props.fetchMoreGeneralChat}
      onLogout={props.handleLogout}
      onNavigate={() => {}}
      userName={props.userName}
    />
  );
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
  const [generalChatHasMore, setGeneralChatHasMore] = useState(true);
  const [generalChatPaginationLoading, setGeneralChatPaginationLoading] = useState(false);
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);
  const [suggestionsWithIds, setSuggestionsWithIds] = useState<Array<{id: string, suggestion: any, status: string}>>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const mentionSuggestions = suggestionsWithIds.map((s) => ({ id: s.id, title: s.suggestion.title, kind: s.suggestion.kind }));
  
  // Map suggestions for Pile/Detail screens
  const pileScreenSuggestions: Suggestion[] = suggestionsWithIds.map((s) => ({
    id: s.id,
    kind: s.suggestion.kind || "digest",
    count: s.suggestion.count || 1,
    title: s.suggestion.title || "Untitled",
    subtitle: s.suggestion.subtitle,
    actions: s.suggestion.actions || [],
    isApproved: s.status === "accepted",
  }));
  
  const chatPanelTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const loadingRef = useRef(false);
  const [isNarrowHeader, setIsNarrowHeader] = useState(
    () => window.matchMedia("(max-width: 480px)").matches
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    // At 375px viewport, should definitely be mobile
    // matchMedia("(max-width: 640px)") should return true
    const result = window.matchMedia("(max-width: 640px)").matches;
    return result;
  });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const handler = (e: MediaQueryListEvent) => setIsNarrowHeader(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsMobileViewport(e.matches);
    };
    mq.addEventListener("change", handler);
    // Also set initial state in case it changed
    setIsMobileViewport(mq.matches);
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
        // Signal to debug overlay that we're in local dev mode
        (window as any).__MAILANIA_LOCAL_DEV__ = data.localDev === true;
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
      setGeneralChatHasMore(data.hasMore !== false); // Default to true if not specified
    } catch {
      setGeneralChatMessages([]);
      setGeneralChatError("Failed to load inbox chat");
    } finally {
      setGeneralChatInitLoading(false);
      setLoading(false);
    }
  }

  async function fetchMoreGeneralChat(beforeId: string) {
    // Guard against concurrent fetches
    if (loadingRef.current) return;
    loadingRef.current = true;
    
    setGeneralChatPaginationLoading(true);
    try {
      const res = await fetch(`/api/chat/general?before=${encodeURIComponent(beforeId)}`);

      if (res.status === 401) {
        setStatus((s) => s ? { ...s, authenticated: false } : null);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load more messages");
      }
      const data = await res.json();
      const newMessages = Array.isArray(data.messages) ? data.messages : [];
      // Prepend new messages at the start
      setGeneralChatMessages((prev) => [...newMessages, ...prev]);
      setGeneralChatHasMore(data.hasMore !== false); // Default to true if not specified
    } catch (err: any) {
      setGeneralChatError(err.message || "Failed to load more messages");
    } finally {
      setGeneralChatPaginationLoading(false);
      loadingRef.current = false;
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
      // Signal to debug overlay that we're in local dev mode
      (window as any).__MAILANIA_LOCAL_DEV__ = data.localDev === true;
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
      "&:hover": { color: "#FF4F8A" },
      "&:focus-visible": { outline: `2px solid #FF4F8A`, outlineOffset: "-2px" },
    }));
    const tabActiveClass = css((t) => ({
      borderBottomColor: "#FF4F8A",
      color: "#FF4F8A",
      fontWeight: "700",
    }));

    return (
      <div className={css((t) => ({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: t.spacing(4), padding: `${t.spacing(5)} ${t.spacing(3)} calc(${t.spacing(5)} + env(safe-area-inset-bottom, 0px))`, boxSizing: "border-box", background: "transparent" }))}>
        {!isPasskeySupported() ? (
          <div className={css((t) => ({ textAlign: "center", maxWidth: "360px", padding: t.spacing(4) }))}>
            <p className={css((t) => ({ color: t.colors.error, fontSize: t.fontSize.sm, lineHeight: "1.6" }))}>
              Your browser does not support passkeys. Mailania requires a browser with WebAuthn support (Chrome, Safari, Firefox, Edge).
            </p>
          </div>
        ) : (
          <div className={css((t) => ({ width: "min(100%, 420px)", display: "flex", flexDirection: "column", gap: t.spacing(3), padding: `${t.spacing(4)} ${t.spacing(4.5)}`, border: "1px solid rgba(255, 255, 255, 0.85)", borderRadius: "24px", background: "rgba(255, 255, 255, 0.55)", backdropFilter: "blur(24px) saturate(1.6)", boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -12px rgba(255, 79, 138, 0.35)", boxSizing: "border-box", "@media (max-width: 480px)": { padding: `${t.spacing(3.5)} ${t.spacing(3)}` } }))}>
            {/* Logomark above branding */}
            <div style={{display: "flex", justifyContent: "center", marginBottom: "16px"}}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FF4F8A" />
                    <stop offset="100%" stopColor="#FF6FA0" />
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
                    "&:focus-visible": { outline: `2px solid #FF4F8A`, outlineOffset: "2px" },
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
                    border: "1px solid rgba(255, 255, 255, 0.6)",
                    fontSize: t.fontSize.base,
                    outline: "none",
                    transition: "border-color 0.15s",
                    background: "rgba(255, 255, 255, 0.15)",
                    backdropFilter: "blur(8px)",
                    color: "#2A0E1A",
                    "&:focus": { borderColor: "rgba(255, 255, 255, 0.95)", background: "rgba(255, 255, 255, 0.25)" },
                    "&:focus-visible": { outline: "2px solid #FF4F8A", outlineOffset: "-2px" },
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
                    "&:focus-visible": { outline: `2px solid #FF4F8A`, outlineOffset: "2px" },
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

  // --- Logged in but no Gmail connected: ConnectGmailScreen (Glassy design) ---
  if (!gmailConnected && !status?.localDev) {
    return (
      <ConnectGmailScreen
        onConnect={() => {
          window.location.href = "/auth/login";
        }}
        isLoading={passkeyLoading}
        error={error || undefined}
      />
    );
  }

  // --- Main authenticated view ---
  if (isMobileViewport) {
    // Single-column mobile layout (Glassy design)
    return (
      <ErrorBoundary>
      <Router>
      <Switch>
        <Route path="/settings">
          <SettingsScreen
            userEmail={status?.user?.email || undefined}
            gmailConnected={gmailConnected}
            onEditPreferences={() => {}} // TODO: wire to preferences editor
            onDisconnect={handleLogout}
            onBack={() => window.history.back()}
            isLoading={passkeyLoading}
          />
        </Route>
        <Route path="/pile/:id">
          {(params) => (
            <MobilePileDetailRoute
              params={params}
              suggestionsWithIds={suggestionsWithIds}
              acceptSuggestion={acceptSuggestion}
              dismissSuggestion={dismissSuggestion}
            />
          )}
        </Route>
        <Route path="/pile">
          <MobilePileRoute
            pileScreenSuggestions={pileScreenSuggestions}
            suggestionsLoading={suggestionsLoading}
            acceptSuggestion={acceptSuggestion}
          />
        </Route>
        <Route>
          <MobileHomeRoute
            generalChatMessages={generalChatMessages}
            generalChatLoading={generalChatLoading}
            generalChatInitLoading={generalChatInitLoading}
            generalChatError={generalChatError}
            generalChatInput={generalChatInput}
            setGeneralChatInput={setGeneralChatInput}
            sendGeneralChatMessage={sendGeneralChatMessage}
            mentionSuggestions={mentionSuggestions}
            chatPanelTextareaRef={chatPanelTextareaRef}
            suggestionsWithIds={suggestionsWithIds}
            suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            status={status}
            testMode={testMode}
            generalChatHasMore={generalChatHasMore}
            generalChatPaginationLoading={generalChatPaginationLoading}
            fetchMoreGeneralChat={fetchMoreGeneralChat}
            pileCount={suggestionsWithIds.length}
            userName={status?.user?.displayName?.split(" ")[0]}
          />
        </Route>
      </Switch>
      </Router>
      </ErrorBoundary>
    );
  }

  // Desktop layout (three-column: sidebar + chat/pile + suggestions)
  return (
    <ErrorBoundary>
    <Router>
    <Switch>
      <Route path="/settings">
        <SettingsScreen
          userEmail={status?.user?.email || undefined}
          gmailConnected={gmailConnected}
          onEditPreferences={() => {}} // TODO: wire to preferences editor
          onDisconnect={handleLogout}
          onBack={() => window.history.back()}
          isLoading={passkeyLoading}
        />
      </Route>
      <Route path="/preferences">
        <PreferencesScreen
          onSave={() => window.history.back()}
          onSkip={() => window.history.back()}
          isLoading={false}
        />
      </Route>
      <Route path="/pile/:id">
        {(params) => (
          <DesktopPileDetailRoute
            params={params}
            suggestionsWithIds={suggestionsWithIds}
            acceptSuggestion={acceptSuggestion}
            dismissSuggestion={dismissSuggestion}
            generalChatMessages={generalChatMessages}
            generalChatLoading={generalChatLoading}
            generalChatInitLoading={generalChatInitLoading}
            generalChatError={generalChatError}
            generalChatInput={generalChatInput}
            setGeneralChatInput={setGeneralChatInput}
            sendGeneralChatMessage={sendGeneralChatMessage}
            mentionSuggestions={mentionSuggestions}
            chatPanelTextareaRef={chatPanelTextareaRef}
            suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            dismissSuggestion2={dismissSuggestion}
            handleMentionSuggestion={handleMentionSuggestion}
            handleSuggestionNotification={handleSuggestionNotification}
            status={status}
            testMode={testMode}
            generalChatHasMore={generalChatHasMore}
            generalChatPaginationLoading={generalChatPaginationLoading}
            fetchMoreGeneralChat={fetchMoreGeneralChat}
            handleLogout={handleLogout}
            userName={status?.user?.displayName?.split(" ")[0]}
          />
        )}
      </Route>
      <Route path="/pile">
        <DesktopPileRoute
          pileScreenSuggestions={pileScreenSuggestions}
          suggestionsLoading={suggestionsLoading}
          acceptSuggestion={acceptSuggestion}
          generalChatMessages={generalChatMessages}
          generalChatLoading={generalChatLoading}
          generalChatInitLoading={generalChatInitLoading}
          generalChatError={generalChatError}
          generalChatInput={generalChatInput}
          setGeneralChatInput={setGeneralChatInput}
          sendGeneralChatMessage={sendGeneralChatMessage}
          mentionSuggestions={mentionSuggestions}
          chatPanelTextareaRef={chatPanelTextareaRef}
          suggestionsWithIds={suggestionsWithIds}
          suggestionsError={suggestionsError}
          dismissSuggestion={dismissSuggestion}
          handleMentionSuggestion={handleMentionSuggestion}
          handleSuggestionNotification={handleSuggestionNotification}
          status={status}
          testMode={testMode}
          generalChatHasMore={generalChatHasMore}
          generalChatPaginationLoading={generalChatPaginationLoading}
          fetchMoreGeneralChat={fetchMoreGeneralChat}
          handleLogout={handleLogout}
          userName={status?.user?.displayName?.split(" ")[0]}
        />
      </Route>
      <Route>
        {() => (
          <DesktopLayoutWithPile
            layout="chat"
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
            status={status}
            testMode={testMode}
            hasMore={generalChatHasMore}
            paginationLoading={generalChatPaginationLoading}
            onLoadMore={fetchMoreGeneralChat}
            onLogout={handleLogout}
            onNavigate={(path) => {}}
            userName={status?.user?.displayName?.split(" ")[0]}
          />
        )}
      </Route>
    </Switch>
    </Router>
    </ErrorBoundary>
  );
}


