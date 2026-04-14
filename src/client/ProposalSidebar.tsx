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
        padding: t.spacing(4),
        background: "linear-gradient(135deg, rgba(217, 70, 166, 0.06), rgba(167, 139, 250, 0.06))",
        borderRadius: t.radiusCard,
        border: "1.5px solid rgba(217, 70, 166, 0.12)",
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(2.5),
        transition: "all 0.3s ease",
        cursor: "pointer",
        "&:hover": { 
          background: "linear-gradient(135deg, rgba(217, 70, 166, 0.1), rgba(167, 139, 250, 0.1))",
          transform: "translateY(-6px)",
          boxShadow: "0 12px 28px rgba(217, 70, 166, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
          borderColor: "rgba(217, 70, 166, 0.2)",
        },
        "&:active": { transform: "translateY(-2px)" },
      }))}
    >
      {/* Header: label + emoji + confidence */}
      <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", gap: t.spacing(2) }))}>
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), flex: 1, minWidth: 0 }))}>
          <span className={css({ fontSize: "18px", flexShrink: 0 })}>
            {kindInfo.icon}
          </span>
          <div className={css({ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 })}>
            <div className={css((t) => ({ fontSize: t.fontSize.sm, fontWeight: "600", color: "#333", lineHeight: "1.35" }))}>
              {suggestion.title}
            </div>
          </div>
        </div>
        <span
          className={css((t) => ({ 
            fontSize: t.fontSize.xs, 
            fontWeight: "600", 
            textTransform: "uppercase", 
            letterSpacing: "0.5px",
            background: t.gradients.confidenceText,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            flexShrink: 0,
          }))}
        >
          {suggestion.confidence}
        </span>
      </div>

      {/* Description */}
      <p
        className={css((t) => ({
          fontSize: t.fontSize.xs,
          color: "#666",
          margin: 0,
          lineHeight: "1.4",
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
      <div className={css((t) => ({ display: "flex", gap: t.spacing(2), marginTop: t.spacing(1) }))}>
        {canApply ? (
          <button
            onClick={handleAccept}
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: "16px",
              background: t.gradients.button,
              color: "#fff",
              fontWeight: "600",
              fontSize: t.fontSize.xs,
              cursor: "pointer",
              transition: "all 0.3s ease",
              minHeight: "auto",
              boxShadow: "0 4px 12px rgba(217, 70, 166, 0.2)",
              "&:hover": { transform: "translateY(-2px)", boxShadow: "0 6px 16px rgba(217, 70, 166, 0.28)" },
              "&:focus-visible": { outline: "none" },
            }))}
          >
            Accept
          </button>
        ) : (
          <button
            disabled
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "1px solid rgba(217, 70, 166, 0.15)",
              borderRadius: "16px",
              background: "rgba(217, 70, 166, 0.08)",
              color: "#d946a6",
              fontWeight: "600",
              fontSize: t.fontSize.xs,
              cursor: "not-allowed",
              minHeight: "auto",
            }))}
            title="Discuss in chat to refine this suggestion"
          >
            Needs Input
          </button>
        )}
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          title="Dismiss this suggestion"
          className={css((t) => ({
            flex: 1,
            padding: `${t.spacing(2)} ${t.spacing(3)}`,
            border: "1px solid rgba(217, 70, 166, 0.15)",
            borderRadius: "16px",
            background: "rgba(217, 70, 166, 0.08)",
            color: "#d946a6",
            fontWeight: "600",
            fontSize: t.fontSize.xs,
            cursor: "pointer",
            transition: "all 0.3s ease",
            minHeight: "auto",
            "&:hover:not(:disabled)": { background: "rgba(217, 70, 166, 0.12)", borderColor: "rgba(217, 70, 166, 0.25)" },
            "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
            "&:focus-visible": { outline: "none" },
          }))}
        >
          {dismissing ? "Dismiss…" : "Dismiss"}
        </button>
        <button
          onClick={handleMention}
          title="Mention this suggestion in the chat"
          className={css((t) => ({
            width: "44px",
            height: "44px",
            minWidth: "44px",
            minHeight: "44px",
            padding: t.spacing(2),
            border: "1.5px solid rgba(167, 139, 250, 0.4)",
            borderRadius: "16px",
            background: "transparent",
            color: "#a78bfa",
            fontSize: t.fontSize.sm,
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "600",
            "&:hover": { background: "rgba(167, 139, 250, 0.08)", borderColor: "rgba(167, 139, 250, 0.6)" },
            "&:focus-visible": { outline: "none" },
          }))}
        >
          @
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
  suggestionsWithIds: SuggestionWithId[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  onDismissSuggestion: (id: string) => Promise<void>;
  onAcceptSuggestion: (id: string) => void;
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
  suggestionsWithIds,
  suggestionsLoading,
  suggestionsError,
  onDismissSuggestion,
  onAcceptSuggestion,
  onMentionSuggestion,
  onSuggestionNotification,
}: ProposalSidebarProps) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Build messageId → message lookup
  const messageMap = new Map<string, InboxMessage>();
  for (const m of messages) {
    messageMap.set(m.id, m);
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
        gap: 0,
        "@media (max-width: 1100px)": { flex: "0 0 300px" },
        "@media (max-width: 960px)": { flex: "1 1 auto", width: "100%" },
      }))}
    >
      {/* Sidebar panel container */}
      <div
        className={css((t) => ({
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 187, 208, 0.08))",
          borderRadius: t.radiusPanel,
          padding: t.spacing(6),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(3.5),
          height: "100%",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(217, 70, 166, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
          border: "1px solid rgba(217, 70, 166, 0.08)",
          maxHeight: "calc(100vh - 180px)",
        }))}
      >
        {/* Title */}
        <div className={css((t) => ({
          fontSize: "13px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "1.2px",
          background: t.gradients.suggestionsTitle,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          margin: "0 0 4px",
        }))}>
          Suggested Actions
        </div>
        {/* Error */}
        {suggestionsError && (
          <div
            className={css((t) => ({
              padding: t.spacing(2.5),
              background: "#fef2f2",
              borderRadius: t.radiusSm,
              color: t.colors.error,
              fontSize: t.fontSize.sm,
            }))}
          >
            <span>{suggestionsError}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {suggestionsLoading && (
          <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
            <ProposalSkeletonCard />
            <ProposalSkeletonCard />
          </div>
        )}

        {/* Empty state */}
        {!suggestionsLoading && suggestionsWithIds.length === 0 && (
          <div
            className={css((t) => ({
              textAlign: "center",
              padding: `${t.spacing(8)} ${t.spacing(4)}`,
              color: t.colors.textMuted,
            }))}
          >
            <div className={css((t) => ({ fontSize: "2.5rem", marginBottom: t.spacing(2) }))}>✨</div>
            <p className={css((t) => ({ fontWeight: "600", fontSize: t.fontSize.sm, margin: "0 0 4px", color: "#333" }))}>No suggestions yet</p>
            <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.xs, margin: 0 }))}>
              Ask the chat to find suggestions for your inbox.
            </p>
          </div>
        )}

        {/* Proposal cards */}
        {!suggestionsLoading && suggestionsWithIds.length > 0 && (
          <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(3.5) }))}>
            {suggestionsWithIds.map((item) => (
              <ProposalCard
                key={item.id}
                id={item.id}
                suggestion={item.suggestion}
                messageMap={messageMap}
                onAccept={() => setAcceptingId(item.id)}
                onDismiss={() => onDismissSuggestion(item.id)}
                onMentionSuggestion={onMentionSuggestion}
                onNotifyAgent={onSuggestionNotification}
              />
            ))}
          </div>
        )}
      </div>

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
            onAcceptSuggestion(acceptingId);
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  );
}
