/**
 * ProposalSidebar — Displays pending suggestions from the API
 *
 * Fetches suggestions from GET /api/suggestions on mount and when refreshKey changes.
 * Allows dismissing/accepting suggestions via PATCH /api/suggestions/:id/status.
 */

import { useState, useEffect } from "react";
import { css } from "@flow-css/core/css";
import theme from "./theme";
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
// ProposalCard — individual card with Accept/Apply + Dismiss
// ---------------------------------------------------------------------------
interface ProposalCardProps {
  id: string;
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  onAccept: () => void;
  onDismiss: () => Promise<void>;
  onMentionSuggestion?: (s: { id: string; title: string }) => void;
  onNotifyAgent?: (title: string, status: "accepted" | "dismissed") => void;
}

function ProposalCard({
  id,
  suggestion,
  messageMap,
  onAccept,
  onDismiss,
  onMentionSuggestion,
  onNotifyAgent,
}: ProposalCardProps) {
  const kindInfo = KIND_LABELS[suggestion.kind];
  const confStyle = CONFIDENCE_STYLES[suggestion.confidence] ?? CONFIDENCE_STYLES.low;
  const msgCount = suggestion.messageIds?.length ?? 0;
  const canApply = suggestion.kind === "archive_bulk" || suggestion.kind === "mark_read_bulk" || suggestion.kind === "create_filter";
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss();
      // Notify agent after PATCH succeeds
      onNotifyAgent?.(suggestion.title, "dismissed");
    } finally {
      setDismissing(false);
    }
  };

  const handleMention = () => {
    onMentionSuggestion?.({ id, title: suggestion.title });
  };

  const handleAccept = () => {
    onAccept();
  };

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
            fontSize: t.fontSize.xs,
            fontWeight: t.fontWeight.semibold,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: t.colors.textMuted,
          }))}
        >
          {kindInfo.icon} {kindInfo.label}
        </span>
        <span
          className={css((t) => ({ fontSize: t.fontSize.xs, fontWeight: t.fontWeight.bold, textTransform: "uppercase", padding: "1px 8px", borderRadius: "999px", letterSpacing: "0.02em" }))}
          style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
        >
          {suggestion.confidence}
        </span>
      </div>

      {/* Title */}
      <h4 className={css((t) => ({ fontSize: t.fontSize.base, fontWeight: t.fontWeight.semibold, margin: 0, lineHeight: "1.35" }))}>
        {suggestion.title}
      </h4>

      {/* Rationale — truncated to 2 lines */}
      <p
        className={css((t) => ({
          fontSize: t.fontSize.xs,
          color: t.colors.textMuted,
          margin: 0,
          lineHeight: "1.45",
          display: "-webkit-box",
          "-webkit-line-clamp": 2,
          "-webkit-box-orient": "vertical",
          overflow: "hidden",
          overflowWrap: "anywhere",
        }))}
      >
        {suggestion.rationale}
      </p>

      {/* Questions — for needs_user_input cards */}
      {suggestion.kind === "needs_user_input" && suggestion.questions && suggestion.questions.length > 0 && (
        <div className={css((t) => ({ marginTop: t.spacing(1.5) }))}>
          <p className={css((t) => ({ fontSize: t.fontSize.xs, fontWeight: t.fontWeight.semibold, color: t.colors.text, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.03em" }))}>
            ❓ Questions for you:
          </p>
          <ul className={css((t) => ({ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }))}>
            {suggestion.questions.map((q, idx) => (
              <li key={idx} className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, lineHeight: "1.4" }))}>
                • {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter draft summary — for create_filter cards */}
      {suggestion.kind === "create_filter" && suggestion.filterDraft && (
        <div className={css((t) => ({ marginTop: t.spacing(1.5), fontSize: t.fontSize.xs, color: t.colors.text }))}>
          <p className={css((t) => ({ margin: "0 0 4px", fontWeight: t.fontWeight.semibold, textTransform: "uppercase", letterSpacing: "0.03em" }))}>
            🔀 Filter:
          </p>
          <div className={css((t) => ({ color: t.colors.textMuted, lineHeight: "1.4" }))}>
            {suggestion.filterDraft.from && <span>{suggestion.filterDraft.from}</span>}
            {suggestion.filterDraft.from && (suggestion.filterDraft.label || suggestion.filterDraft.archive) && <span> → </span>}
            {suggestion.filterDraft.archive && <span>archive</span>}
            {suggestion.filterDraft.archive && suggestion.filterDraft.label && <span>, </span>}
            {suggestion.filterDraft.label && <span>label: {suggestion.filterDraft.label}</span>}
          </div>
        </div>
      )}

      {/* Meta: message count */}
      {msgCount > 0 && (
        <span className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, display: "flex", alignItems: "center", gap: t.spacing(1) }))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {msgCount} message{msgCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Action buttons */}
      <div className={css((t) => ({ display: "flex", gap: t.spacing(1.5), paddingTop: t.spacing(1), borderTop: `1px solid ${t.colors.borderLight}` }))}>
        {canApply ? (
          <button
            onClick={handleAccept}
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: t.colors.primary,
              color: "#fff",
              fontWeight: t.fontWeight.semibold,
              fontSize: t.fontSize.xs,
              cursor: "pointer",
              transition: "background 0.15s",
              "&:hover": { background: t.colors.primaryHover },
              "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
            }))}
          >
            <span aria-hidden="true">⚡</span> Accept / Apply
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
              fontWeight: t.fontWeight.medium,
              fontSize: t.fontSize.xs,
              cursor: "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
            }))}
            title="Discuss in chat to refine this suggestion"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Needs Input
          </button>
        )}
        <button
          onClick={handleMention}
          title="Mention this suggestion in the chat"
          className={css((t) => ({
            padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
            border: `1px solid ${t.colors.borderLight}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.textMuted,
            fontSize: t.fontSize.xs,
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
            "&:hover": { background: "#f0f3ff", color: "#4f46e5", borderColor: "#4f46e5" },
            "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
          }))}
        >
          @ Mention
        </button>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          title="Dismiss this suggestion"
          className={css((t) => ({
            padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
            border: `1px solid ${t.colors.borderLight}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.textMuted,
            fontSize: t.fontSize.xs,
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
            "&:hover:not(:disabled)": { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" },
            "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
            "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
          }))}
        >
          <span aria-hidden="true">✕</span> {dismissing ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ProposalSidebar component
// ---------------------------------------------------------------------------
export interface ProposalSidebarProps {
  messages?: InboxMessage[];
  onAuthLost: () => void;
  /** Trigger refetch when this changes */
  refreshKey: number;
  onMentionSuggestion?: (s: { id: string; title: string }) => void;
  onSuggestionNotification?: (title: string, status: "accepted" | "dismissed") => void;
}

interface SuggestionWithId {
  id: string;
  suggestion: TriageSuggestion;
  status: string;
}

export default function ProposalSidebar({
  messages = [],
  onAuthLost,
  refreshKey,
  onMentionSuggestion,
  onSuggestionNotification,
}: ProposalSidebarProps) {
  const [suggestionsWithIds, setSuggestionsWithIds] = useState<SuggestionWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Build messageId → message lookup
  const messageMap = new Map<string, InboxMessage>();
  for (const m of messages) {
    messageMap.set(m.id, m);
  }

  // Load suggestions on mount and when refreshKey changes
  useEffect(() => {
    async function loadSuggestions() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/suggestions");
        if (res.status === 401) {
          onAuthLost();
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to load suggestions (${res.status})`);
        }
        const data = await res.json();
        setSuggestionsWithIds(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (err: any) {
        setError(err.message || "Failed to load suggestions");
        setSuggestionsWithIds([]);
      } finally {
        setLoading(false);
      }
    }
    loadSuggestions();
  }, [refreshKey]);

  // Auto-show sidebar when suggestions arrive
  useEffect(() => {
    if (suggestionsWithIds.length > 0) {
      setSidebarCollapsed(false);
    }
  }, [suggestionsWithIds]);

  async function dismissSuggestion(id: string) {
    try {
      const res = await fetch(`/api/suggestions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (res.status === 401) {
        onAuthLost();
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to dismiss suggestion (${res.status})`);
      }
      // Remove from local list
      setSuggestionsWithIds((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to dismiss suggestion");
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
        onAuthLost();
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to accept suggestion (${res.status})`);
      }
      // Remove from local list
      setSuggestionsWithIds((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to accept suggestion");
    }
  }

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
          padding: `${t.spacing(3)} ${t.spacing(4)}`,
          border: `1px solid ${t.colors.border}`,
          borderRadius: t.radius,
          cursor: "pointer",
          fontSize: t.fontSize.sm,
          fontWeight: t.fontWeight.bold,
          color: t.colors.text,
          transition: "background 0.15s, border-radius 0.15s, border-color 0.15s",
          "&:hover": { background: t.colors.borderLight },
          "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "-2px" },
        }))}
        style={sidebarCollapsed
          ? { backgroundColor: "#fafaf8" }
          : {
              backgroundColor: "#eef2ff",
              borderColor: "#4f46e5",
              borderBottomColor: "transparent",
              borderRadius: "0.5rem 0.5rem 0 0",
              color: "#4f46e5",
              fontWeight: "700",
            }}
      >
        <span className={css({ display: "flex", alignItems: "center", gap: "8px" })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0,verticalAlign:"middle"}}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          Proposals
          {suggestionsWithIds.length > 0 && (
            <span
              className={`${css((t) => ({
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: t.fontSize.xs,
                fontWeight: t.fontWeight.semibold,
              }))} ${suggestionsWithIds.length > 0 ? "proposals-badge-pulse" : ""}`}
              style={suggestionsWithIds.length > 0 ? { background: theme.colors.primary, color: "#fff" } : { background: theme.colors.border, color: theme.colors.textMuted }}
            >
              {suggestionsWithIds.length}
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
          {/* Error */}
          {error && (
            <div
              className={css((t) => ({
                padding: t.spacing(2.5),
                background: "#fef2f2",
                borderRadius: t.radiusSm,
                color: t.colors.error,
                fontSize: t.fontSize.sm,
              }))}
            >
              <span>{error}</span>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
              <ProposalSkeletonCard />
              <ProposalSkeletonCard />
            </div>
          )}

          {/* Empty state */}
          {!loading && suggestionsWithIds.length === 0 && (
            <div
              className={css((t) => ({
                textAlign: "center",
                padding: `${t.spacing(6)} ${t.spacing(3)}`,
                background: t.colors.bgAlt,
                borderRadius: t.radius,
              }))}
            >
              <div className={css({ fontSize: "2rem", marginBottom: "6px" })}>✨</div>
              <p className={css((t) => ({ fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.sm, margin: "0 0 4px" }))}>No proposals yet</p>
              <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.xs, margin: 0 }))}>
                Ask the chat agent to create suggestions for your inbox.
              </p>
            </div>
          )}

          {/* Proposal cards */}
          {!loading && suggestionsWithIds.length > 0 && (
            <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
              {suggestionsWithIds.map((item) => (
                <ProposalCard
                  key={item.id}
                  id={item.id}
                  suggestion={item.suggestion}
                  messageMap={messageMap}
                  onAccept={() => setAcceptingId(item.id)}
                  onDismiss={() => dismissSuggestion(item.id)}
                  onMentionSuggestion={onMentionSuggestion}
                  onNotifyAgent={onSuggestionNotification}
                />
              ))}
            </div>
          )}

          {/* Chat hint */}
          {suggestionsWithIds.length > 0 && !loading && (
            <div
              className={css((t) => ({
                padding: t.spacing(2.5),
                background: t.colors.primaryLight,
                borderRadius: t.radiusSm,
                fontSize: t.fontSize.xs,
                color: "#1e40af",
                lineHeight: t.lineHeight.normal,
                display: "flex",
                alignItems: "flex-start",
                gap: t.spacing(1.5),
              }))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0, marginTop: "1px", flexShrink: 0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>Refine any proposal by discussing it in the chat. The agent will update suggestions based on your instructions.</span>
            </div>
          )}
        </div>
      )}

      {/* Approval confirmation modal */}
      {acceptingId && suggestionsWithIds.find((s) => s.id === acceptingId) && (
        <ApprovalConfirmModal
          suggestion={suggestionsWithIds.find((s) => s.id === acceptingId)!.suggestion}
          messageMap={messageMap}
          onClose={() => setAcceptingId(null)}
          onSuccess={(msg) => {
            const suggestion = suggestionsWithIds.find((s) => s.id === acceptingId)!;
            setAcceptingId(null);
            setToastMsg(msg);
            // Notify agent after successful execution
            onSuggestionNotification?.(suggestion.suggestion.title, "accepted");
            // Mark as accepted and remove from list
            acceptSuggestion(acceptingId);
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  );
}
