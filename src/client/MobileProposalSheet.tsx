/**
 * MobileProposalSheet — Mobile bottom-sheet for proposal cards
 *
 * On mobile (≤640px), proposals are hidden from the sidebar and
 * surfaced via a fixed "Proposals (N)" tab at the bottom of the screen.
 * Tapping it reveals a slide-up sheet with the full proposal UI.
 * 
 * Fetches suggestions from GET /api/suggestions on mount and when refreshKey changes.
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

interface SuggestionWithId {
  id: string;
  suggestion: TriageSuggestion;
  status: string;
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
// ProposalCard (mobile version — slightly larger touch targets)
// ---------------------------------------------------------------------------
interface MobileProposalCardProps {
  id: string;
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  onAccept: () => void;
  onDismiss: () => Promise<void>;
  onMentionSuggestion?: (s: { id: string; title: string }) => void;
  onClose?: () => void;
}

function MobileProposalCard({
  id,
  suggestion,
  messageMap,
  onAccept,
  onDismiss,
  onMentionSuggestion,
  onClose,
}: MobileProposalCardProps) {
  const kindInfo = KIND_LABELS[suggestion.kind];
  const confStyle = CONFIDENCE_STYLES[suggestion.confidence] ?? CONFIDENCE_STYLES.low;
  const msgCount = suggestion.messageIds?.length ?? 0;
  const canApply = suggestion.kind === "archive_bulk" || suggestion.kind === "create_filter";
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss();
    } finally {
      setDismissing(false);
    }
  };

  const handleMention = () => {
    onMentionSuggestion?.({ id, title: suggestion.title });
    onClose?.();
  };

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
          overflowWrap: "anywhere",
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
          onClick={handleMention}
          title="Mention this suggestion in the chat"
          aria-label="Mention this suggestion in the chat"
          className={css((t) => ({
            padding: `${t.spacing(3)} ${t.spacing(2)}`,
            border: `1px solid ${t.colors.borderLight}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.textMuted,
            fontSize: t.fontSize.sm,
            cursor: "pointer",
            minHeight: "44px",
            transition: "background 0.15s, color 0.15s",
            "&:hover": { background: "#f0f3ff", color: "#4f46e5", borderColor: "#4f46e5" },
            "&:active": { background: "#e8ecff", color: "#4f46e5" },
          }))}
        >
          @
        </button>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
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
            "&:hover:not(:disabled)": { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" },
            "&:active:not(:disabled)": { background: "#fef2f2", color: "#dc2626" },
            "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
          }))}
        >
          {dismissing ? "…" : "✕"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileProposalSheet
// ---------------------------------------------------------------------------
export interface MobileProposalSheetProps {
  messages: InboxMessage[];
  onAuthLost: () => void;
  refreshKey: number;
  onMountChange?: (mounted: boolean) => void;
  onMentionSuggestion?: (s: { id: string; title: string }) => void;
}

export default function MobileProposalSheet({
  messages,
  onAuthLost,
  refreshKey,
  onMountChange,
  onMentionSuggestion,
}: MobileProposalSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [suggestionsWithIds, setSuggestionsWithIds] = useState<SuggestionWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
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

  const hasProposals = suggestionsWithIds.length > 0;

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
          {hasProposals && (
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
              style={{ background: "rgba(255,255,255,0.25)", color: t.colors.bg }}
            >
              {suggestionsWithIds.length}
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
              {suggestionsWithIds.length > 0 && (
                <span
                  className={css((t) => ({
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: t.fontSize.xs,
                    fontWeight: "700",
                    flexShrink: 0,
                  }))}
                  style={{ background: t.colors.primary, color: t.colors.bg }}
                >
                  {suggestionsWithIds.length}
                </span>
              )}
            </div>
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
            {/* Error */}
            {error && (
              <div
                className={css((t) => ({
                  padding: t.spacing(3),
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
              <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(3) }))}>
                <ProposalSkeletonCard />
                <ProposalSkeletonCard />
              </div>
            )}

            {/* Empty state */}
            {!loading && suggestionsWithIds.length === 0 && (
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
                  Ask the chat agent to create suggestions for your inbox.
                </p>
              </div>
            )}

            {/* Proposal cards */}
            {!loading && suggestionsWithIds.length > 0 && (
              <>
                {suggestionsWithIds.map((item) => (
                  <MobileProposalCard
                    key={item.id}
                    id={item.id}
                    suggestion={item.suggestion}
                    messageMap={messageMap}
                    onAccept={() => setAcceptingId(item.id)}
                    onDismiss={() => dismissSuggestion(item.id)}
                    onMentionSuggestion={onMentionSuggestion}
                    onClose={closeSheet}
                  />
                ))}

                <div
                  className={css((thm) => ({
                    padding: thm.spacing(3),
                    background: thm.colors.primaryLight,
                    borderRadius: thm.radiusSm,
                    fontSize: thm.fontSize.sm,
                    color: "#1e40af",
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
      {acceptingId && suggestionsWithIds.find((s) => s.id === acceptingId) && (
        <ApprovalConfirmModal
          suggestion={suggestionsWithIds.find((s) => s.id === acceptingId)!.suggestion}
          messageMap={messageMap}
          onClose={() => setAcceptingId(null)}
          onSuccess={(msg) => {
            setAcceptingId(null);
            setToastMsg(msg);
            // Mark as accepted and remove from list
            acceptSuggestion(acceptingId);
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </>
  );
}
