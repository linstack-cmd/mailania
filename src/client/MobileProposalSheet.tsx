/**
 * MobileProposalSheet — Mobile bottom-sheet for proposal cards
 *
 * On mobile (≤640px), proposals are hidden from the sidebar and
 * surfaced via a fixed "Proposals (N)" tab at the bottom of the screen.
 * Tapping it reveals a slide-up sheet with the full proposal UI.
 */

import { useState, useEffect, useRef } from "react";
import { css } from "@flow-css/core/css";
import t from "./theme";
import {
  type TriageSuggestion,
  type InboxMessage,
  KIND_LABELS,
  CONFIDENCE_STYLES,
  ApprovalConfirmModal,
  Toast,
} from "./TriageSuggestions";

// ---------------------------------------------------------------------------
// Skeleton shimmer
// ---------------------------------------------------------------------------
const skeletonLineClass = css({
  borderRadius: "4px",
  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
  backgroundSize: "200px 100%",
  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
});

function SkeletonLine({ width = "100%", height = "12px" }: { width?: string; height?: string }) {
  return <div className={skeletonLineClass} style={{ width, height }} />;
}

function ProposalSkeletonCard() {
  return (
    <div
      className={css((t) => ({
        padding: t.spacing(3),
        border: `1px solid ${t.colors.borderLight}`,
        borderRadius: t.radius,
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(2),
      }))}
    >
      <div className={css({ display: "flex", justifyContent: "space-between" })}>
        <SkeletonLine width="60px" height="12px" />
        <SkeletonLine width="50px" height="12px" />
      </div>
      <SkeletonLine width="90%" height="14px" />
      <SkeletonLine width="100%" height="10px" />
      <SkeletonLine width="70%" height="10px" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProposalCard (mobile version — slightly larger touch targets)
// ---------------------------------------------------------------------------
function MobileProposalCard({
  suggestion,
  messageMap,
  isDismissed,
  onAccept,
  onDismiss,
}: {
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  isDismissed: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const kindInfo = KIND_LABELS[suggestion.kind];
  const confStyle = CONFIDENCE_STYLES[suggestion.confidence] ?? CONFIDENCE_STYLES.low;
  const msgCount = suggestion.messageIds?.length ?? 0;
  const canApply = suggestion.kind === "archive_bulk" || suggestion.kind === "create_filter";

  if (isDismissed) {
    return (
      <div
        className={css((t) => ({
          padding: `${t.spacing(3)} ${t.spacing(3.5)}`,
          border: `1px dashed ${t.colors.borderLight}`,
          borderRadius: t.radius,
          background: t.colors.bgAlt,
          opacity: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: t.spacing(2),
        }))}
      >
        <span
          className={css((t) => ({
            fontSize: t.fontSize.sm,
            color: t.colors.textMuted,
            fontStyle: "italic",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }))}
        >
          {kindInfo.icon} {suggestion.title}
        </span>
        <button
          onClick={onDismiss}
          title="Restore"
          className={css((t) => ({
            fontSize: t.fontSize.sm,
            color: t.colors.primary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
            minHeight: "44px",
            minWidth: "44px",
            flexShrink: 0,
            "&:hover": { textDecoration: "underline" },
          }))}
        >
          ↩ Restore
        </button>
      </div>
    );
  }

  return (
    <div
      className={css((t) => ({
        padding: `${t.spacing(3.5)} ${t.spacing(3.5)}`,
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        background: t.colors.bg,
        boxShadow: t.shadow,
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(2.5),
        transition: "border-color 0.15s",
      }))}
    >
      {/* Kind + confidence row */}
      <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(1) }))}>
        <span
          className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(1),
            fontSize: t.fontSize.xs,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: t.colors.textMuted,
          }))}
        >
          {kindInfo.icon} {kindInfo.label}
        </span>
        <span
          className={css((t) => ({ fontSize: t.fontSize.xs, fontWeight: "700", textTransform: "uppercase", padding: "2px 10px", borderRadius: "999px", letterSpacing: "0.02em" }))}
          style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
        >
          {suggestion.confidence}
        </span>
      </div>

      {/* Title */}
      <h4
        className={css((t) => ({
          fontSize: t.fontSize.base,
          fontWeight: "600",
          margin: 0,
          lineHeight: "1.35",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }))}
      >
        {suggestion.title}
      </h4>

      {/* Rationale */}
      <p
        className={css((t) => ({
          fontSize: t.fontSize.sm,
          color: t.colors.textMuted,
          margin: 0,
          lineHeight: "1.5",
          display: "-webkit-box",
          "-webkit-line-clamp": 3,
          "-webkit-box-orient": "vertical",
          overflow: "hidden",
        }))}
      >
        {suggestion.rationale}
      </p>

      {/* Meta */}
      {msgCount > 0 && (
        <span className={css((t) => ({ fontSize: t.fontSize.sm, color: t.colors.textMuted }))}>
          📧 {msgCount} message{msgCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Action buttons — full-width, large touch targets */}
      <div className={css((t) => ({ display: "flex", gap: t.spacing(2), paddingTop: t.spacing(1.5), borderTop: `1px solid ${t.colors.borderLight}`, minWidth: 0, "@media (max-width: 380px)": { flexDirection: "column" } }))}>
        {canApply ? (
          <button
            onClick={onAccept}
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(3)} ${t.spacing(2)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: t.colors.primary,
              color: t.colors.bg,
              fontWeight: "600",
              fontSize: t.fontSize.sm,
              cursor: "pointer",
              minHeight: "44px",
              transition: "background 0.15s",
              "&:hover": { background: t.colors.primaryHover },
              "&:active": { background: t.colors.primaryHover },
            }))}
          >
            ⚡ Accept / Apply
          </button>
        ) : (
          <button
            disabled
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(3)} ${t.spacing(2)}`,
              border: `1px solid ${t.colors.borderLight}`,
              borderRadius: t.radiusSm,
              background: t.colors.bgAlt,
              color: t.colors.textMuted,
              fontWeight: "500",
              fontSize: t.fontSize.sm,
              cursor: "not-allowed",
              minHeight: "44px",
            }))}
            title="Discuss in chat to refine this suggestion"
          >
            💬 Needs Input
          </button>
        )}
        <button
          onClick={onDismiss}
          title="Dismiss this suggestion"
          className={css((t) => ({
            padding: `${t.spacing(3)} ${t.spacing(3)}`,
            border: `1px solid ${t.colors.borderLight}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.textMuted,
            fontSize: t.fontSize.sm,
            cursor: "pointer",
            minHeight: "44px",
            minWidth: "44px",
            transition: "background 0.15s, color 0.15s",
            "&:hover": { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" },
            "&:active": { background: "#fef2f2", color: "#dc2626" },
          }))}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
interface ProgressState {
  stage: string;
  percent: number;
  suggestionsCount?: number;
}

function TriageProgressBar({ progress }: { progress: ProgressState }) {
  return (
    <div
      className={css((t) => ({
        padding: t.spacing(3),
        background: t.colors.bgAlt,
        borderRadius: t.radius,
        border: `1px solid ${t.colors.borderLight}`,
      }))}
    >
      <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.spacing(2) }))}>
        <span className={css((t) => ({ fontSize: t.fontSize.sm, fontWeight: "600", color: t.colors.text }))}>
          {progress.stage}
        </span>
        <span className={css((t) => ({ fontSize: t.fontSize.sm, fontWeight: "600", color: t.colors.primary }))}>
          {progress.percent}%
        </span>
      </div>
      <div className={css((t) => ({ height: "6px", borderRadius: "3px", background: t.colors.borderLight, overflow: "hidden" }))}>
        <div
          style={{ width: `${progress.percent}%`, transition: "width 0.4s ease-out" }}
          className={css((t) => ({
            height: "100%",
            borderRadius: "3px",
            background: `linear-gradient(90deg, ${t.colors.primary}, #6366f1)`,
          }))}
        />
      </div>
      {(progress.suggestionsCount ?? 0) > 0 && (
        <div className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, marginTop: t.spacing(1) }))}>
          {progress.suggestionsCount} suggestion{progress.suggestionsCount !== 1 ? "s" : ""} so far
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileProposalSheet
// ---------------------------------------------------------------------------
export interface MobileProposalSheetProps {
  messages: InboxMessage[];
  onAuthLost: () => void;
  externalSuggestions?: TriageSuggestion[] | null;
  externalRunId?: string | null;
  externalLastRunAt?: string | null;
  onMountChange?: (mounted: boolean) => void;
}

export default function MobileProposalSheet({
  messages,
  onAuthLost,
  externalSuggestions,
  externalRunId,
  externalLastRunAt,
  onMountChange,
}: MobileProposalSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [suggestions, setSuggestions] = useState<TriageSuggestion[] | null>(
    externalSuggestions ?? null
  );
  const [lastRunAt, setLastRunAt] = useState<string | null>(externalLastRunAt ?? null);
  const [runId, setRunId] = useState<string | null>(externalRunId ?? null);
  const [initialLoading, setInitialLoading] = useState(externalSuggestions === undefined);
  const [triageLoading, setTriageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => new Set());
  const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(window.matchMedia("(max-width: 640px)").matches);
  const [isNarrowTab, setIsNarrowTab] = useState(window.matchMedia("(max-width: 360px)").matches);
  const sheetRef = useRef<HTMLDivElement>(null);

  const messageMap = new Map<string, InboxMessage>();
  for (const m of messages) messageMap.set(m.id, m);

  useEffect(() => {
    onMountChange?.(true);
    return () => onMountChange?.(false);
  }, [onMountChange]);

  // Listen to media query changes and track mobile viewport state
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mq.matches);
    mq.addEventListener("change", handler);

    const mqNarrow = window.matchMedia("(max-width: 360px)");
    const handlerNarrow = (e: MediaQueryListEvent) => setIsNarrowTab(e.matches);
    setIsNarrowTab(mqNarrow.matches);
    mqNarrow.addEventListener("change", handlerNarrow);

    return () => {
      mq.removeEventListener("change", handler);
      mqNarrow.removeEventListener("change", handlerNarrow);
    };
  }, []);

  // Sync external props
  useEffect(() => {
    if (externalSuggestions !== undefined) {
      setSuggestions(externalSuggestions);
      setInitialLoading(false);
    }
    if (externalRunId !== undefined) setRunId(externalRunId ?? null);
    if (externalLastRunAt !== undefined) setLastRunAt(externalLastRunAt ?? null);
  }, [externalSuggestions, externalRunId, externalLastRunAt]);

  // Load on mount if not externally controlled
  useEffect(() => {
    if (externalSuggestions !== undefined) return;
    async function loadLatest() {
      try {
        const res = await fetch("/api/triage/latest");
        if (res.status === 401) { onAuthLost(); return; }
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.suggestions)) {
            setSuggestions(data.suggestions);
            setLastRunAt(data.createdAt);
            setRunId(data.runId?.toString() ?? null);
          } else {
            setSuggestions(null);
          }
        }
      } catch { /* silently ignore */ }
      finally { setInitialLoading(false); }
    }
    loadLatest();
  }, []);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  function openSheet() {
    setIsClosing(false);
    setIsOpen(true);
  }

  function closeSheet() {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 280);
  }

  async function runTriage() {
    setTriageLoading(true);
    setError(null);
    setSuggestions(null);
    setLastRunAt(null);
    setRunId(null);
    setDismissedIds(new Set());
    setProgress({ stage: "Starting triage…", percent: 0 });

    try {
      const res = await fetch("/api/triage/suggest-stream", { method: "POST" });
      if (res.status === 401) { onAuthLost(); setTriageLoading(false); setProgress(null); return; }
      if (!res.ok) { throw new Error(await res.text() || `Server error (${res.status})`); }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Streaming not supported");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json);
            if (event.type === "progress" || event.type === "batch_done") {
              setProgress({ stage: event.stage || "Processing…", percent: event.percent ?? 0, suggestionsCount: event.suggestionsCount });
            } else if (event.type === "complete") {
              setSuggestions(Array.isArray(event.suggestions) ? event.suggestions : []);
              setProgress(null);
            } else if (event.type === "saved") {
              setRunId(event.runId?.toString() ?? null);
              setLastRunAt(event.createdAt ?? null);
            } else if (event.type === "error") {
              setError(event.error || "Triage failed");
              setProgress(null);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      setError(e.message || "Failed to generate suggestions");
      setProgress(null);
    } finally {
      setTriageLoading(false);
    }
  }

  function toggleDismiss(index: number) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  const activeSuggestions = suggestions ?? [];
  const visibleCount = activeSuggestions.filter((_, i) => !dismissedIds.has(i)).length;
  const hasProposals = activeSuggestions.length > 0;

  return (
    <>
      {/* Fixed bottom tab bar — rendered conditionally based on viewport width */}
      {isMobileViewport && (
      <div
        className={css((t) => ({
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          maxWidth: "100vw",
          zIndex: 100,
          background: t.colors.bgAlt,
          borderTop: `2px solid ${t.colors.border}`,
          boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
          padding: `${t.spacing(2.5)} ${t.spacing(3)} env(safe-area-inset-bottom, 8px)`,
          boxSizing: "border-box",
          display: "flex",
          "@media (max-width: 360px)": {
            /* Collapse to a small floating pill at very narrow widths */
            position: "fixed",
            bottom: "12px",
            right: "12px",
            left: "auto",
            width: "auto",
            maxWidth: "none",
            background: "transparent",
            borderTop: "none",
            boxShadow: "none",
            padding: 0,
          },
        }))}
      >
        <button
          onClick={openSheet}
          style={hasProposals ? { background: t.colors.primary, color: t.colors.bg } : { background: t.colors.bgAlt, color: t.colors.textMuted }}
          className={css((t) => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: t.spacing(2),
            flex: 1,
            padding: `${t.spacing(3)} ${t.spacing(4)}`,
            border: "none",
            borderRadius: t.radius,
            fontWeight: "600",
            fontSize: t.fontSize.base,
            cursor: "pointer",
            minHeight: "48px",
            transition: "background 0.15s, color 0.15s",
            "&:active": { opacity: 0.85 },
            "@media (max-width: 360px)": {
              padding: `${t.spacing(2)} ${t.spacing(2.5)}`,
              minHeight: "40px",
              fontSize: t.fontSize.sm,
              borderRadius: "999px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              flex: "none",
            },
          }))}
        >
          {isNarrowTab ? "📋" : "📋 Proposals"}
          {(hasProposals || initialLoading || triageLoading) && (
            <span
              className={css((t) => ({
                padding: "2px 10px",
                borderRadius: "999px",
                fontSize: t.fontSize.xs,
                fontWeight: "700",
                "@media (max-width: 360px)": {
                  padding: "1px 6px",
                  fontSize: t.fontSize.xs,
                },
              }))}
              style={
                hasProposals
                  ? { background: "rgba(255,255,255,0.25)", color: t.colors.bg }
                  : { background: t.colors.border, color: t.colors.textMuted }
              }
            >
              {triageLoading || initialLoading ? "…" : visibleCount}
            </span>
          )}
        </button>
      </div>
      )}

      {/* Bottom sheet overlay */}
      {isOpen && isMobileViewport && (
        <div
          style={{ animation: isClosing ? "sheet-backdrop-in 0.28s ease reverse" : "sheet-backdrop-in 0.2s ease forwards" }}
          className={css((t) => ({
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 200,
          }))}
          onClick={closeSheet}
        />
      )}

      {isOpen && isMobileViewport && (
        <div
          ref={sheetRef}
          style={{ animation: isClosing ? "sheet-slide-down 0.28s ease forwards" : "sheet-slide-up 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards" }}
          className={css((t) => ({
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            width: "100%",
            maxWidth: "100vw",
            zIndex: 201,
            background: t.colors.bg,
            borderRadius: "1rem 1rem 0 0",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
            maxHeight: "85dvh",
            overflow: "hidden",
            boxSizing: "border-box",
            overscrollBehavior: "contain",
          }))}
        >
          {/* Drag handle */}
          <div
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `${t.spacing(2)} ${t.spacing(4)} ${t.spacing(1)}`,
              flexShrink: 0,
            }))}
          >
            <div
              className={css((t) => ({
                width: "36px",
                height: "4px",
                borderRadius: "2px",
                background: t.colors.border,
              }))}
            />
          </div>

          {/* Sheet header */}
          <div
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${t.spacing(2)} ${t.spacing(3)} ${t.spacing(3)}`,
              borderBottom: `1px solid ${t.colors.borderLight}`,
              flexShrink: 0,
              gap: t.spacing(2),
              minWidth: 0,
              "@media (max-width: 380px)": {
                flexWrap: "wrap",
                alignItems: "stretch",
              },
            }))}
          >
            <div className={css({ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" })}>
              <h2 className={css((thm) => ({ fontSize: thm.fontSize.base, fontWeight: "700", margin: 0, flexShrink: 0 }))}>
                📋 Proposals
              </h2>
              {activeSuggestions.length > 0 && (
                <span
                  className={css((t) => ({
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: t.fontSize.xs,
                    fontWeight: "700",
                    flexShrink: 0,
                  }))}
                  style={
                    visibleCount > 0
                      ? { background: t.colors.primary, color: t.colors.bg }
                      : { background: t.colors.border, color: t.colors.textMuted }
                  }
                >
                  {visibleCount}
                </span>
              )}
            </div>
            <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(1.5), flexShrink: 0, "@media (max-width: 380px)": { width: "100%" } }))}>
              <button
                onClick={runTriage}
                disabled={triageLoading || initialLoading}
                className={css((t) => ({
                  padding: `${t.spacing(1.5)} ${t.spacing(2.5)}`,
                  border: "none",
                  borderRadius: t.radiusSm,
                  fontSize: t.fontSize.sm,
                  fontWeight: "600",
                  cursor: "pointer",
                  minHeight: "36px",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s",
                  "@media (max-width: 380px)": { flex: 1 },
                }))}
                style={
                  triageLoading || initialLoading
                    ? { background: t.colors.border, color: t.colors.textMuted, cursor: "not-allowed" }
                    : { background: t.colors.primaryLight, color: t.colors.primary }
                }
              >
                {triageLoading ? "Analyzing…" : suggestions ? "↻ Re-run" : "✦ Generate"}
              </button>
              <button
                onClick={closeSheet}
                aria-label="Close proposals"
                className={css((t) => ({
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px solid ${t.colors.borderLight}`,
                  borderRadius: t.radius,
                  background: "transparent",
                  color: t.colors.textMuted,
                  fontSize: t.fontSize.lg,
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "background 0.15s",
                  "&:active": { background: t.colors.bgAlt },
                }))}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div
            className={css((t) => ({
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: `${t.spacing(3)} ${t.spacing(3)} calc(${t.spacing(4)} + env(safe-area-inset-bottom, 0px))`,
              display: "flex",
              flexDirection: "column",
              gap: t.spacing(3),
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              minWidth: 0,
            }))}
          >
            {/* Last run info */}
            {lastRunAt && !triageLoading && (
              <p className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, margin: 0 }))}>
                Last run: {new Date(lastRunAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            {/* Error */}
            {error && (
              <div
                className={css((t) => ({
                  padding: t.spacing(3),
                  background: "#fef2f2",
                  borderRadius: t.radiusSm,
                  color: t.colors.error,
                  fontSize: t.fontSize.sm,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: t.spacing(2),
                }))}
              >
                <span>{error}</span>
                <button
                  onClick={runTriage}
                  className={css((t) => ({
                    padding: `${t.spacing(1.5)} ${t.spacing(2.5)}`,
                    border: `1px solid ${t.colors.error}`,
                    borderRadius: t.radiusSm,
                    background: "transparent",
                    color: t.colors.error,
                    cursor: "pointer",
                    fontSize: t.fontSize.sm,
                    fontWeight: "600",
                    flexShrink: 0,
                    minHeight: "44px",
                  }))}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Progress */}
            {progress && <TriageProgressBar progress={progress} />}

            {/* Loading skeleton */}
            {initialLoading && !progress && (
              <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(3) }))}>
                <ProposalSkeletonCard />
                <ProposalSkeletonCard />
              </div>
            )}

            {/* Empty state */}
            {!initialLoading && !triageLoading && !progress && activeSuggestions.length === 0 && (
              <div
                className={css((t) => ({
                  textAlign: "center",
                  padding: `${t.spacing(8)} ${t.spacing(4)}`,
                  background: t.colors.bgAlt,
                  borderRadius: t.radius,
                }))}
              >
                <div className={css((thm) => ({ fontSize: thm.fontSize.xl, marginBottom: "8px" }))}>✨</div>
                <p className={css((t) => ({ fontWeight: "600", fontSize: t.fontSize.base, margin: "0 0 6px" }))}>No proposals yet</p>
                <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.sm, margin: 0, lineHeight: "1.5" }))}>
                  Tap "Generate" to create triage suggestions, or discuss with the chat agent.
                </p>
              </div>
            )}

            {/* Proposal cards */}
            {!initialLoading && activeSuggestions.length > 0 && (
              <>
                {activeSuggestions.map((s, i) => (
                  <MobileProposalCard
                    key={i}
                    suggestion={s}
                    messageMap={messageMap}
                    isDismissed={dismissedIds.has(i)}
                    onAccept={() => setAcceptingIndex(i)}
                    onDismiss={() => toggleDismiss(i)}
                  />
                ))}

                {dismissedIds.size > 0 && (
                  <p className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, textAlign: "center", margin: 0 }))}>
                    {dismissedIds.size} dismissed — tap ↩ Restore to undo
                  </p>
                )}

                <div
                  className={css((thm) => ({
                    padding: thm.spacing(3),
                    background: thm.colors.bgSubtle,
                    borderRadius: thm.radiusSm,
                    fontSize: thm.fontSize.sm,
                    color: thm.colors.primary,
                    lineHeight: "1.5",
                  }))}
                >
                  💬 Close this sheet and chat to refine proposals. The agent will update suggestions based on your instructions.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Approval modal */}
      {acceptingIndex !== null && suggestions?.[acceptingIndex] && (
        <ApprovalConfirmModal
          suggestion={suggestions[acceptingIndex]}
          messageMap={messageMap}
          onClose={() => setAcceptingIndex(null)}
          onSuccess={(msg) => {
            setAcceptingIndex(null);
            setToastMsg(msg);
            setDismissedIds((prev) => {
              const next = new Set(prev);
              next.add(acceptingIndex!);
              return next;
            });
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </>
  );
}
