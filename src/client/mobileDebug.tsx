import { useEffect, useMemo, useState, Component } from "react";
import type { ReactNode } from "react";
import { css } from "@flow-css/core/css";

type LatestSuggestionsState = "undefined" | "null" | `count:${number}`;

export interface MailaniaMobileDebugState {
  bootedJs: boolean;
  statusFetch: "idle" | "pending" | "ok" | "error";
  statusFetchHttp?: number;
  statusFetchError?: string | null;
  authenticated?: boolean | null;
  gmailConnected?: boolean | null;
  statusUserExists?: boolean | null;
  messagesCount?: number | null;
  generalChatMessagesCount?: number | null;
  latestSuggestionsState?: LatestSuggestionsState;
  routePath: string;
  chatPanelMounted: boolean;
  mobileProposalSheetMounted: boolean;
  appError?: string | null;
  windowError?: string | null;
  unhandledRejection?: string | null;
  errorBoundaryError?: string | null;
  windowInnerHeight?: number;
  visualViewportHeight?: number;
  snapContainerHeight?: number;
  lastUpdatedAt: string;
  localDev?: boolean;
  swipeTouchLogs?: Array<{ time: string; event: string; details: Record<string, any> }>;
}

declare global {
  interface Window {
    __MAILANIA_MOBILE_DEBUG__?: MailaniaMobileDebugState;
  }
}

const DEBUG_EVENT = "mailania-mobile-debug:update";

interface RootErrorBoundaryState { error: Error | null }

export class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    const details = `${error.message}${error.stack ? `
${error.stack}` : ""}${info.componentStack ? `
${info.componentStack}` : ""}`;
    updateMobileDebug({ errorBoundaryError: details, appError: details });
    console.error("[Mailania root crash]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "24px", fontFamily: "monospace", color: "#dc2626", background: "#fef2f2", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: "12px" }}>⚠️ App crashed before rendering</h2>
          <p style={{ marginBottom: "12px", color: "#7f1d1d" }}>Open the debug badge and send Danny a screenshot of this screen plus the debug panel.</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{this.state.error.message}{"\n"}{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}


function nowIso() {
  return new Date().toISOString();
}

function currentPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getDefaultMobileDebugState(): MailaniaMobileDebugState {
  return {
    bootedJs: true,
    statusFetch: "idle",
    statusFetchHttp: undefined,
    statusFetchError: null,
    authenticated: null,
    gmailConnected: null,
    statusUserExists: null,
    messagesCount: null,
    generalChatMessagesCount: null,
    latestSuggestionsState: "undefined",
    routePath: currentPath(),
    chatPanelMounted: false,
    mobileProposalSheetMounted: false,
    appError: null,
    windowError: null,
    unhandledRejection: null,
    errorBoundaryError: null,
    windowInnerHeight: undefined,
    visualViewportHeight: undefined,
    snapContainerHeight: undefined,
    lastUpdatedAt: nowIso(),
    localDev: undefined,
    swipeTouchLogs: [],
  };
}

export function getMobileDebugState(): MailaniaMobileDebugState {
  if (typeof window === "undefined") return getDefaultMobileDebugState();
  if (!window.__MAILANIA_MOBILE_DEBUG__) {
    window.__MAILANIA_MOBILE_DEBUG__ = getDefaultMobileDebugState();
  }
  return window.__MAILANIA_MOBILE_DEBUG__;
}

function emitMobileDebugUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEBUG_EVENT, { detail: getMobileDebugState() }));
}

export function updateMobileDebug(patch: Partial<MailaniaMobileDebugState>) {
  if (typeof window === "undefined") return;
  window.__MAILANIA_MOBILE_DEBUG__ = {
    ...getMobileDebugState(),
    ...patch,
    routePath: patch.routePath ?? currentPath(),
    lastUpdatedAt: nowIso(),
  };
  emitMobileDebugUpdate();
}

export function markMobileDebugMounted(key: "chatPanelMounted" | "mobileProposalSheetMounted", mounted: boolean) {
  updateMobileDebug({ [key]: mounted } as Partial<MailaniaMobileDebugState>);
}

const MAX_TOUCH_LOGS = 50;

export function logSwipeTouchEvent(event: string, details: Record<string, any>) {
  const state = getMobileDebugState();
  const logs = [...(state.swipeTouchLogs || [])];
  
  // Keep only the last MAX_TOUCH_LOGS entries
  if (logs.length >= MAX_TOUCH_LOGS) {
    logs.shift();
  }
  
  logs.push({
    time: nowIso(),
    event,
    details,
  });
  
  updateMobileDebug({ swipeTouchLogs: logs });
}

function truncateError(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`.slice(0, 1200);
  }
  if (typeof value === "string") return value.slice(0, 1200);
  try {
    return JSON.stringify(value).slice(0, 1200);
  } catch {
    return String(value).slice(0, 1200);
  }
}

export function installMobileDebugGlobalHandlers() {
  if (typeof window === "undefined") return () => {};

  updateMobileDebug({ bootedJs: true, routePath: currentPath() });

  const onError = (event: ErrorEvent) => {
    const text = event.error ? truncateError(event.error) : `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`;
    updateMobileDebug({ windowError: text });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    updateMobileDebug({ unhandledRejection: truncateError(event.reason) });
  };
  const onPopState = () => updateMobileDebug({ routePath: currentPath() });
  const onHashChange = () => updateMobileDebug({ routePath: currentPath() });

  const wrapHistory = <K extends "pushState" | "replaceState">(key: K) => {
    const original = window.history[key];
    const wrapped = function (this: History, ...args: Parameters<History[K]>) {
      const result = original.apply(this, args);
      updateMobileDebug({ routePath: currentPath() });
      return result;
    };
    window.history[key] = wrapped as History[K];
    return () => {
      window.history[key] = original;
    };
  };

  const restorePushState = wrapHistory("pushState");
  const restoreReplaceState = wrapHistory("replaceState");

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", onHashChange);

  return () => {
    restorePushState();
    restoreReplaceState();
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
  };
}

export function shouldShowMobileDebug(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debugMobile") === "1") return true;
  if (params.get("debugMobile") === "0") return false;
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 640px), (pointer: coarse)").matches
    : false;
}

function useMobileDebugState() {
  const [state, setState] = useState<MailaniaMobileDebugState>(() => getMobileDebugState());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setState({ ...getMobileDebugState() });
    sync();
    window.addEventListener(DEBUG_EVENT, sync as EventListener);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener(DEBUG_EVENT, sync as EventListener);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return state;
}

function fieldValue(value: unknown) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

export function MobileDebugOverlay() {
  const state = useMobileDebugState();
  const [copied, setCopied] = useState(false);
  const [buttonTop, setButtonTop] = useState<number | undefined>(undefined);
  const BUTTON_HEIGHT = 32; // Approximate height of the button

  useEffect(() => {
    const update = () => {
      updateMobileDebug({
        windowInnerHeight: window.innerHeight,
        visualViewportHeight: window.visualViewport?.height ?? undefined,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  // Position button relative to visual viewport
  useEffect(() => {
    const updateButtonPosition = () => {
      if (window.visualViewport) {
        const top = window.visualViewport.offsetTop + window.visualViewport.height - BUTTON_HEIGHT - 12;
        setButtonTop(top);
      }
    };
    updateButtonPosition();
    window.visualViewport?.addEventListener("resize", updateButtonPosition);
    window.visualViewport?.addEventListener("scroll", updateButtonPosition);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateButtonPosition);
      window.visualViewport?.removeEventListener("scroll", updateButtonPosition);
    };
  }, []);

  const visible = useMemo(() => shouldShowMobileDebug(), [state.routePath]);
  if (!visible) return null;

  const handleCopyDebug = async () => {
    const debugPayload = {
      ...state,
      windowInnerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height,
    };
    const jsonStr = JSON.stringify(debugPayload, null, 2);
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("[Mailania debug] Failed to copy to clipboard:", err);
    }
  };

  const buttonStyle = buttonTop !== undefined
    ? {
        position: "fixed" as const,
        top: buttonTop,
        right: 12,
        zIndex: 2147483647,
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 999,
        background: "rgba(17,24,39,0.92)",
        color: "#fff",
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 700 as const,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        maxWidth: "calc(100vw - 24px)",
      }
    : {
        position: "fixed" as const,
        right: 12,
        bottom: 12,
        zIndex: 2147483647,
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 999,
        background: "rgba(17,24,39,0.92)",
        color: "#fff",
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 700 as const,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        maxWidth: "calc(100vw - 24px)",
      };

  const [showPanel, setShowPanel] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPanel(!showPanel)}
        onPointerDown={(e) => e.preventDefault()}
        style={buttonStyle}
      >
        {showPanel ? "×" : "debug"}
      </button>

      {showPanel && (
        <div
          style={{
            position: "fixed",
            bottom: 50,
            right: 12,
            width: "calc(100vw - 24px)",
            maxHeight: "60vh",
            background: "rgba(17, 24, 39, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "8px",
            padding: "12px",
            overflowY: "auto",
            zIndex: 2147483646,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "11px",
            color: "#d1d5db",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <button
              onClick={handleCopyDebug}
              style={{
                background: "rgba(99, 102, 241, 0.8)",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: "bold",
                marginBottom: "8px",
              }}
            >
              {copied ? "✓ copied!" : "copy debug"}
            </button>
          </div>

          <div style={{ marginBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "8px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px", color: "#f3f4f6" }}>Touch/Scroll Logs:</div>
            {state.swipeTouchLogs && state.swipeTouchLogs.length > 0 ? (
              <div>
                {state.swipeTouchLogs.map((log, idx) => (
                  <div key={idx} style={{ marginBottom: "6px", padding: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "3px" }}>
                    <div style={{ color: "#60a5fa", fontWeight: "bold" }}>{log.event}</div>
                    <div style={{ color: "#9ca3af", fontSize: "10px" }}>{log.time}</div>
                    {Object.entries(log.details).map(([key, value]) => (
                      <div key={key} style={{ color: "#d1d5db", marginLeft: "4px" }}>
                        {key}: <span style={{ color: "#fbbf24" }}>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#9ca3af" }}>No touch/scroll events yet...</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
