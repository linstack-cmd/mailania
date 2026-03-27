/**
 * ProposalSidebar — Phase 1 UX redesign
 *
 * Renders latest triage suggestions as actionable proposal cards in a
 * collapsible right sidebar. Reuses ApprovalConfirmModal for Accept/Apply.
 */

import { useState, useEffect } from "react";
import { css } from "@flow-css/core/css";
import {
  type TriageSuggestion,
  type InboxMessage,
  KIND_LABELS,
  CONFIDENCE_STYLES,
  ApprovalConfirmModal,
  Toast,
} from "./TriageSuggestions";

// ---------------------------------------------------------------------------
// Progress state (mirrors TriageSuggestions)
// ---------------------------------------------------------------------------
interface ProgressState {
  stage: string;
  percent: number;
  totalMessages?: number;
  suggestionsCount?: number;
  currentBatch?: number;
  totalBatches?: number;
}

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
// ProposalCard — individual card with Accept/Apply + Dismiss
// ---------------------------------------------------------------------------
function ProposalCard({
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
          padding: t.spacing(3),
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
        <span className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, fontStyle: "italic" }))}>
          {kindInfo.icon} {suggestion.title}
        </span>
        <button
          onClick={onDismiss}
          title="Restore"
          className={css((t) => ({
            fontSize: "0.75rem",
            color: t.colors.primary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: `${t.spacing(0.5)} ${t.spacing(1)}`,
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
        padding: t.spacing(3),
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        background: t.colors.bg,
        boxShadow: t.shadow,
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(2),
        transition: "border-color 0.15s",
        "&:hover": { borderColor: t.colors.primary },
      }))}
    >
      {/* Kind + confidence row */}
      <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(1) }))}>
        <span
          className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(1),
            fontSize: "0.7rem",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: t.colors.textMuted,
          }))}
        >
          {kindInfo.icon} {kindInfo.label}
        </span>
        <span
          className={css({ fontSize: "0.68rem", fontWeight: "700", textTransform: "uppercase", padding: "1px 8px", borderRadius: "999px", letterSpacing: "0.02em" })}
          style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
        >
          {suggestion.confidence}
        </span>
      </div>

      {/* Title */}
      <h4 className={css((t) => ({ fontSize: "0.9rem", fontWeight: "600", margin: 0, lineHeight: "1.35" }))}>
        {suggestion.title}
      </h4>

      {/* Rationale — truncated to 2 lines */}
      <p
        className={css((t) => ({
          fontSize: "0.8rem",
          color: t.colors.textMuted,
          margin: 0,
          lineHeight: "1.45",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }))}
      >
        {suggestion.rationale}
      </p>

      {/* Meta: message count */}
      {msgCount > 0 && (
        <span className={css((t) => ({ fontSize: "0.75rem", color: t.colors.textMuted }))}>
          📧 {msgCount} message{msgCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Action buttons */}
      <div className={css((t) => ({ display: "flex", gap: t.spacing(2), paddingTop: t.spacing(1), borderTop: `1px solid ${t.colors.borderLight}` }))}>
        {canApply ? (
          <button
            onClick={onAccept}
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: t.colors.primary,
              color: "#fff",
              fontWeight: "600",
              fontSize: "0.78rem",
              cursor: "pointer",
              transition: "background 0.15s",
              "&:hover": { background: t.colors.primaryHover },
            }))}
          >
            ⚡ Accept / Apply
          </button>
        ) : (
          <button
            disabled
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
              border: `1px solid ${t.colors.borderLight}`,
              borderRadius: t.radiusSm,
              background: t.colors.bgAlt,
              color: t.colors.textMuted,
              fontWeight: "500",
              fontSize: "0.78rem",
              cursor: "not-allowed",
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
            padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
            border: `1px solid ${t.colors.borderLight}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.textMuted,
            fontSize: "0.78rem",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
            "&:hover": { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" },
          }))}
        >
          ✕ Dismiss
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
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
        <span className={css((t) => ({ fontSize: "0.82rem", fontWeight: "600", color: t.colors.text }))}>
          {progress.stage}
        </span>
        <span className={css((t) => ({ fontSize: "0.78rem", fontWeight: "600", color: t.colors.primary }))}>
          {progress.percent}%
        </span>
      </div>
      <div className={css((t) => ({ height: "5px", borderRadius: "3px", background: t.colors.borderLight, overflow: "hidden" }))}>
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
        <div className={css((t) => ({ fontSize: "0.72rem", color: t.colors.textMuted, marginTop: t.spacing(1) }))}>
          {progress.suggestionsCount} suggestion{progress.suggestionsCount !== 1 ? "s" : ""} so far
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ProposalSidebar component
// ---------------------------------------------------------------------------
export interface ProposalSidebarProps {
  messages: InboxMessage[];
  onAuthLost: () => void;
  /** Controlled: lifted external suggestions (e.g. from App-level triage fetch) */
  externalSuggestions?: TriageSuggestion[] | null;
  externalRunId?: string | null;
  externalLastRunAt?: string | null;
}

export default function ProposalSidebar({
  messages,
  onAuthLost,
  externalSuggestions,
  externalRunId,
  externalLastRunAt,
}: ProposalSidebarProps) {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Build messageId → message lookup
  const messageMap = new Map<string, InboxMessage>();
  for (const m of messages) {
    messageMap.set(m.id, m);
  }

  // Sync external suggestions when they change
  useEffect(() => {
    if (externalSuggestions !== undefined) {
      setSuggestions(externalSuggestions);
      setInitialLoading(false);
    }
    if (externalRunId !== undefined) setRunId(externalRunId ?? null);
    if (externalLastRunAt !== undefined) setLastRunAt(externalLastRunAt ?? null);
  }, [externalSuggestions, externalRunId, externalLastRunAt]);

  // Load latest triage on mount (if no external suggestions passed)
  useEffect(() => {
    if (externalSuggestions !== undefined) return; // externally controlled
    async function loadLatest() {
      try {
        const res = await fetch("/api/triage/latest");
        if (res.status === 401) { onAuthLost(); return; }
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions) {
            setSuggestions(data.suggestions);
            setLastRunAt(data.createdAt);
            setRunId(data.runId?.toString() ?? null);
          }
        }
      } catch { /* silently ignore */ }
      finally { setInitialLoading(false); }
    }
    loadLatest();
  }, []);

  // Auto-show sidebar when proposals arrive
  useEffect(() => {
    if (suggestions && suggestions.length > 0) {
      setSidebarCollapsed(false);
    }
  }, [suggestions]);

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
              setProgress({
                stage: event.stage || "Processing…",
                percent: event.percent ?? 0,
                totalMessages: event.totalMessages,
                suggestionsCount: event.suggestionsCount,
                currentBatch: event.currentBatch,
                totalBatches: event.totalBatches,
              });
            } else if (event.type === "complete") {
              setSuggestions(event.suggestions ?? []);
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
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const activeSuggestions = suggestions ?? [];
  const visibleCount = activeSuggestions.filter((_, i) => !dismissedIds.has(i)).length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className={css((t) => ({
        flex: "0 0 340px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(3),
        "@media (max-width: 1100px)": { flex: "0 0 300px" },
        "@media (max-width: 960px)": { flex: "1 1 auto", width: "100%" },
      }))}
    >
      {/* Sidebar toggle header */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-expanded={!sidebarCollapsed}
        className={css((t) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: `${t.spacing(2.5)} ${t.spacing(3.5)}`,
          background: t.colors.bgAlt,
          border: `1px solid ${t.colors.border}`,
          borderRadius: t.radius,
          cursor: "pointer",
          fontSize: "0.92rem",
          fontWeight: "700",
          color: t.colors.text,
          transition: "background 0.15s, border-radius 0.15s",
          "&:hover": { background: t.colors.borderLight },
        }))}
        style={sidebarCollapsed ? undefined : { borderRadius: "0.5rem 0.5rem 0 0" }}
      >
        <span className={css({ display: "flex", alignItems: "center", gap: "8px" })}>
          📋 Proposals
          {activeSuggestions.length > 0 && (
            <span
              className={css((t) => ({
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: "0.72rem",
                fontWeight: "600",
              }))}
              style={
                visibleCount > 0
                  ? { background: "#2563eb", color: "#fff" }
                  : { background: "#e5e7eb", color: "#6b7280" }
              }
            >
              {visibleCount}
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: "0.8rem",
            transition: "transform 0.2s",
            transform: sidebarCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {/* Sidebar body */}
      {!sidebarCollapsed && (
        <div
          className={css((t) => ({
            border: `1px solid ${t.colors.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${t.radius} ${t.radius}`,
            background: t.colors.bg,
            padding: t.spacing(3),
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(3),
            maxHeight: "calc(100vh - 180px)",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "#d1d5db transparent",
          }))}
        >
          {/* Sub-header: last run info + generate button */}
          <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(2) }))}>
            <div>
              {lastRunAt && !triageLoading ? (
                <p className={css((t) => ({ fontSize: "0.72rem", color: t.colors.textMuted, margin: 0 }))}>
                  Run: {new Date(lastRunAt).toLocaleString()}
                </p>
              ) : !triageLoading && !initialLoading ? (
                <p className={css((t) => ({ fontSize: "0.72rem", color: t.colors.textMuted, margin: 0 }))}>
                  No triage run yet
                </p>
              ) : null}
            </div>
            <button
              onClick={runTriage}
              disabled={triageLoading || initialLoading}
              className={css((t) => ({
                padding: `${t.spacing(1)} ${t.spacing(3)}`,
                border: "none",
                borderRadius: t.radiusSm,
                fontSize: "0.75rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "background 0.15s",
                flexShrink: 0,
              }))}
              style={
                triageLoading || initialLoading
                  ? { background: "#e5e7eb", color: "#9ca3af", cursor: "not-allowed" }
                  : { background: "#eff6ff", color: "#1d4ed8" }
              }
            >
              {triageLoading ? "Analyzing…" : suggestions ? "↻ Regenerate" : "✦ Generate Triage"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              className={css((t) => ({
                padding: t.spacing(2.5),
                background: "#fef2f2",
                borderRadius: t.radiusSm,
                color: t.colors.error,
                fontSize: "0.82rem",
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
                  padding: `${t.spacing(1)} ${t.spacing(2)}`,
                  border: `1px solid ${t.colors.error}`,
                  borderRadius: t.radiusSm,
                  background: "transparent",
                  color: t.colors.error,
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  flexShrink: 0,
                  "&:hover": { background: "rgba(239,68,68,0.08)" },
                }))}
              >
                Retry
              </button>
            </div>
          )}

          {/* Progress */}
          {progress && <TriageProgressBar progress={progress} />}

          {/* Initial skeleton */}
          {initialLoading && !progress && (
            <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
              <ProposalSkeletonCard />
              <ProposalSkeletonCard />
            </div>
          )}

          {/* Empty state */}
          {!initialLoading && !triageLoading && !progress && activeSuggestions.length === 0 && (
            <div
              className={css((t) => ({
                textAlign: "center",
                padding: `${t.spacing(6)} ${t.spacing(3)}`,
                background: t.colors.bgAlt,
                borderRadius: t.radius,
              }))}
            >
              <div className={css({ fontSize: "2rem", marginBottom: "6px" })}>✨</div>
              <p className={css({ fontWeight: "600", fontSize: "0.88rem", margin: "0 0 4px" })}>No proposals yet</p>
              <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.8rem", margin: 0 }))}>
                Run triage to generate suggestions, or ask the chat agent.
              </p>
            </div>
          )}

          {/* Proposal cards */}
          {!initialLoading && activeSuggestions.length > 0 && (
            <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
              {activeSuggestions.map((s, i) => (
                <ProposalCard
                  key={i}
                  suggestion={s}
                  messageMap={messageMap}
                  isDismissed={dismissedIds.has(i)}
                  onAccept={() => setAcceptingIndex(i)}
                  onDismiss={() => toggleDismiss(i)}
                />
              ))}

              {/* Hint about dismissed items */}
              {dismissedIds.size > 0 && (
                <p className={css((t) => ({ fontSize: "0.72rem", color: t.colors.textMuted, textAlign: "center", margin: 0 }))}>
                  {dismissedIds.size} dismissed — click ↩ Restore to undo
                </p>
              )}
            </div>
          )}

          {/* Chat hint */}
          {activeSuggestions.length > 0 && !initialLoading && (
            <div
              className={css((t) => ({
                padding: t.spacing(2.5),
                background: "#eff6ff",
                borderRadius: t.radiusSm,
                fontSize: "0.78rem",
                color: "#1e40af",
                lineHeight: "1.5",
              }))}
            >
              💬 Refine any proposal by discussing it in the chat. The agent will update suggestions based on your instructions.
            </div>
          )}
        </div>
      )}

      {/* Approval confirmation modal */}
      {acceptingIndex !== null && suggestions?.[acceptingIndex] && (
        <ApprovalConfirmModal
          suggestion={suggestions[acceptingIndex]}
          messageMap={messageMap}
          onClose={() => setAcceptingIndex(null)}
          onSuccess={(msg) => {
            setAcceptingIndex(null);
            setToastMsg(msg);
            // Mark as dismissed after successful apply
            setDismissedIds((prev) => {
              const next = new Set(prev);
              next.add(acceptingIndex);
              return next;
            });
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  );
}
