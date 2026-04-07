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
  lastUpdatedAt: string;
  localDev?: boolean;
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
    lastUpdatedAt: nowIso(),
    localDev: undefined,
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
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debugMobile") === "1";
  });

  const visible = useMemo(() => shouldShowMobileDebug(), [state.routePath]);
  if (!visible) return null;

  const rows: Array<[string, unknown]> = [
    ["bootedJS", state.bootedJs],
    ["statusFetch", state.statusFetch],
    ["statusHttp", state.statusFetchHttp],
    ["authenticated", state.authenticated],
    ["gmailConnected", state.gmailConnected],
    ["status.user", state.statusUserExists],
    ["messages", state.messagesCount],
    ["generalChat", state.generalChatMessagesCount],
    ["latestSuggestions", state.latestSuggestionsState],
    ["path", state.routePath],
    ["ChatPanel", state.chatPanelMounted],
    ["MobileSheet", state.mobileProposalSheetMounted],
    ["appError", state.appError],
    ["window.onerror", state.windowError],
    ["unhandledrej", state.unhandledRejection],
    ["boundary", state.errorBoundaryError],
    ["updated", state.lastUpdatedAt],
  ];

  return (
    <>
      {state.localDev && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 2147483647,
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 999,
          background: "rgba(17,24,39,0.92)",
          color: "#fff",
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        debug {state.authenticated ? "auth" : "anon"} · {state.routePath}
      </button>
      )}
      {state.localDev && open && (
        <div
          className={css({
            position: "fixed",
            left: "12px",
            right: "12px",
            bottom: "56px",
            zIndex: 2147483647,
            background: "rgba(17,24,39,0.96)",
            color: "#fff",
            borderRadius: "12px",
            padding: "12px",
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "11px",
            lineHeight: "1.45",
            maxHeight: "55vh",
            overflowY: "auto",
            border: "1px solid rgba(255,255,255,0.15)",
          })}
        >
          <div className={css({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "8px" })}>
            <strong>Mailania mobile debug</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "4px 8px", fontSize: 11 }}
            >
              close
            </button>
          </div>
          <div className={css({ display: "grid", gridTemplateColumns: "minmax(96px, 120px) 1fr", gap: "6px 8px", alignItems: "start" })}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <div style={{ opacity: 0.72 }}>{label}</div>
                <div style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{fieldValue(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
