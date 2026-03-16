import { useState, useEffect, useRef, useCallback } from "react";
import { css } from "@flow-css/core/css";

interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead?: boolean;
}

interface FilterDraft {
  from?: string;
  subjectContains?: string;
  hasWords?: string;
  label?: string;
  archive?: boolean;
}

interface TriageSuggestion {
  kind: "archive_bulk" | "create_filter" | "needs_user_input";
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  messageIds?: string[];
  filterDraft?: FilterDraft;
  questions?: string[];
}

const KIND_LABELS: Record<TriageSuggestion["kind"], { icon: string; label: string; desc: string }> = {
  archive_bulk: { icon: "📦", label: "Archive", desc: "Bulk archive safe-to-dismiss messages" },
  create_filter: { icon: "🔀", label: "Filter", desc: "Create a Gmail filter for recurring patterns" },
  needs_user_input: { icon: "❓", label: "Needs Input", desc: "Requires your decision before proceeding" },
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
  medium: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  low: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
};

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

function TriageSkeletonCard() {
  return (
    <div
      className={css((t) => ({
        padding: t.spacing(4),
        border: `1px solid ${t.colors.borderLight}`,
        borderRadius: t.radius,
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(3),
        animation: "skeleton-pulse 2s ease-in-out infinite",
      }))}
    >
      <div className={css({ display: "flex", justifyContent: "space-between" })}>
        <SkeletonLine width="80px" height="14px" />
        <SkeletonLine width="100px" height="14px" />
      </div>
      <SkeletonLine width="85%" height="16px" />
      <SkeletonLine width="100%" height="11px" />
      <SkeletonLine width="60%" height="11px" />
    </div>
  );
}

export default function TriageSuggestions({
  messages,
  onAuthLost,
}: {
  messages: InboxMessage[];
  onAuthLost: () => void;
}) {
  const [suggestions, setSuggestions] = useState<TriageSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(() => new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Build messageId → message lookup from inbox
  const messageMap = new Map<string, InboxMessage>();
  for (const m of messages) {
    messageMap.set(m.id, m);
  }

  // Load persisted suggestions on mount
  useEffect(() => {
    async function loadLatest() {
      try {
        const res = await fetch("/api/triage/latest");
        if (res.status === 401) {
          onAuthLost();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions) {
            setSuggestions(data.suggestions);
            setLastRunAt(data.createdAt);
          }
        }
      } catch {
        // Silently ignore
      } finally {
        setInitialLoading(false);
      }
    }
    loadLatest();
  }, []);

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setLastRunAt(null);
    setReviewedIds(new Set());
    setSelectedIndex(null);
    try {
      const res = await fetch("/api/triage/suggest", { method: "POST" });
      if (res.status === 401) {
        onAuthLost();
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Server error (${res.status})`);
      }
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setLastRunAt(data.createdAt ?? null);
    } catch (e: any) {
      setError(e.message || "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  }

  function markReviewed(index: number) {
    setReviewedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const selectedSuggestion = selectedIndex !== null && suggestions ? suggestions[selectedIndex] : null;

  return (
    <section>
      {/* Header row */}
      <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: t.spacing(3) }))}>
        <div>
          <h2 className={css({ fontSize: "1.25rem", fontWeight: "700", margin: "0" })}>🧹 Triage Suggestions</h2>
          <p className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, margin: `${t.spacing(1)} 0 0` }))}>
            {lastRunAt && !loading
              ? `Last run: ${new Date(lastRunAt).toLocaleString()}`
              : "AI-powered inbox organization — click a card for details"}
          </p>
        </div>
        <button
          onClick={fetchSuggestions}
          disabled={loading || initialLoading}
          className={[
            css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(5)}`,
              border: "none",
              borderRadius: t.radiusSm,
              fontSize: "0.88rem",
              fontWeight: "600",
              transition: "background 0.15s, transform 0.1s",
              "&:active": { transform: "scale(0.97)" },
            })),
            loading || initialLoading
              ? css((t) => ({ background: t.colors.borderLight, color: t.colors.textMuted, cursor: "not-allowed" }))
              : css((t) => ({ background: t.colors.primary, color: "#fff", cursor: "pointer", "&:hover": { background: t.colors.primaryHover } })),
          ].join(" ")}
        >
          {loading ? "Analyzing…" : suggestions ? "Regenerate" : "Generate Triage"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className={css((t) => ({
            marginTop: t.spacing(3),
            padding: t.spacing(4),
            background: "#fef2f2",
            borderRadius: t.radius,
            color: t.colors.error,
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: t.spacing(3),
          }))}
        >
          <span>{error}</span>
          <button
            onClick={fetchSuggestions}
            className={css((t) => ({
              padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.error}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.error,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "600",
              flexShrink: 0,
              "&:hover": { background: "rgba(239,68,68,0.08)" },
            }))}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {(loading || initialLoading) && (
        <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(3), marginTop: t.spacing(4) }))}>
          <TriageSkeletonCard />
          <TriageSkeletonCard />
          <TriageSkeletonCard />
        </div>
      )}

      {/* Empty result */}
      {suggestions && suggestions.length === 0 && !loading && (
        <div
          className={css((t) => ({
            textAlign: "center",
            padding: `${t.spacing(10)} ${t.spacing(4)}`,
            background: t.colors.bgAlt,
            borderRadius: t.radius,
            marginTop: t.spacing(4),
          }))}
        >
          <div className={css((t) => ({ fontSize: "2.5rem", marginBottom: t.spacing(2) }))}>✨</div>
          <p className={css({ fontWeight: "600", fontSize: "1.05rem" })}>Your inbox looks good!</p>
          <p className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.88rem", marginTop: t.spacing(1) }))}>
            No suggestions right now — check back later.
          </p>
        </div>
      )}

      {/* Suggestion cards — displayed as a grid on wider screens */}
      {suggestions && suggestions.length > 0 && !loading && (
        <div
          className={css((t) => ({
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: t.spacing(3),
            marginTop: t.spacing(4),
            "@media (min-width: 720px)": {
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            },
          }))}
        >
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              suggestion={s}
              messageMap={messageMap}
              isReviewed={reviewedIds.has(i)}
              onMarkReviewed={() => markReviewed(i)}
              onToast={setToastMsg}
              onClick={() => setSelectedIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedSuggestion && selectedIndex !== null && (
        <SuggestionDetailModal
          suggestion={selectedSuggestion}
          messageMap={messageMap}
          isReviewed={reviewedIds.has(selectedIndex)}
          onMarkReviewed={() => markReviewed(selectedIndex)}
          onToast={setToastMsg}
          lastRunAt={lastRunAt}
          onClose={() => setSelectedIndex(null)}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </section>
  );
}

// --- Toast component ---
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className={css((t) => ({
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e293b",
        color: "#fff",
        padding: `${t.spacing(3)} ${t.spacing(5)}`,
        borderRadius: t.radius,
        fontSize: "0.88rem",
        fontWeight: "500",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 9999,
        animation: "toast-in 0.25s ease-out",
        pointerEvents: "none",
      }))}
    >
      {message}
    </div>
  );
}

// --- Suggestion Card (clickable summary) ---
function SuggestionCard({
  suggestion: s,
  messageMap,
  isReviewed,
  onMarkReviewed,
  onToast,
  onClick,
}: {
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  isReviewed: boolean;
  onMarkReviewed: () => void;
  onToast: (msg: string) => void;
  onClick: () => void;
}) {
  const kindInfo = KIND_LABELS[s.kind];
  const confStyle = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;
  const msgCount = s.messageIds?.length ?? 0;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${kindInfo.label}: ${s.title}. Click for details.`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={css((t) => ({
        padding: t.spacing(4),
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        background: t.colors.bg,
        boxShadow: t.shadow,
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.15s",
        "&:hover": {
          borderColor: t.colors.primary,
          boxShadow: `${t.shadowMd}, 0 0 0 1px ${t.colors.primary}22`,
          transform: "translateY(-1px)",
        },
        "&:focus-visible": {
          outline: `2px solid ${t.colors.primary}`,
          outlineOffset: "2px",
          boxShadow: "0 0 0 4px rgba(37,99,235,0.12)",
        },
        "&:active": {
          transform: "translateY(0)",
        },
      }))}
      style={isReviewed ? { borderColor: "#10b981", background: "#f0fdf4" } : undefined}
    >
      {/* Top row: kind badge + confidence pill */}
      <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: t.spacing(2) }))}>
        <span
          className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(1),
            fontSize: "0.72rem",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: t.colors.textMuted,
          }))}
        >
          {kindInfo.icon} {kindInfo.label}
        </span>
        <span
          className={css({
            fontSize: "0.72rem",
            fontWeight: "700",
            textTransform: "uppercase",
            padding: "2px 10px",
            borderRadius: "999px",
            letterSpacing: "0.02em",
          })}
          style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
        >
          {s.confidence}
        </span>
      </div>

      {/* Title */}
      <h3 className={css((t) => ({ fontSize: "1rem", fontWeight: "600", marginTop: t.spacing(2), lineHeight: "1.35" }))}>{s.title}</h3>

      {/* Rationale — truncated to 2 lines */}
      <p
        className={css((t) => ({
          fontSize: "0.85rem",
          color: t.colors.textMuted,
          marginTop: t.spacing(1.5),
          lineHeight: "1.5",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }))}
      >
        {s.rationale}
      </p>

      {/* Footer: message count + reviewed state + "view details" hint */}
      <div
        className={css((t) => ({
          marginTop: t.spacing(3),
          paddingTop: t.spacing(2.5),
          borderTop: `1px solid ${t.colors.borderLight}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: t.spacing(2),
        }))}
      >
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2) }))}>
          {msgCount > 0 && (
            <span className={css((t) => ({ fontSize: "0.78rem", color: t.colors.textMuted }))}>
              {msgCount} message{msgCount !== 1 ? "s" : ""}
            </span>
          )}
          {isReviewed && (
            <span className={css({ fontSize: "0.78rem", color: "#10b981", fontWeight: "600" })}>
              ✓ Reviewed
            </span>
          )}
        </div>
        <span className={css((t) => ({ fontSize: "0.78rem", color: t.colors.primary, fontWeight: "500" }))}>
          View details →
        </span>
      </div>
    </div>
  );
}

// --- Detail Modal ---
function SuggestionDetailModal({
  suggestion: s,
  messageMap,
  isReviewed,
  onMarkReviewed,
  onToast,
  lastRunAt,
  onClose,
}: {
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  isReviewed: boolean;
  onMarkReviewed: () => void;
  onToast: (msg: string) => void;
  lastRunAt: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // Determine if this suggestion is executable (has a Phase 2 action)
  const isExecutable = s.kind === "archive_bulk" || s.kind === "create_filter";
  const kindInfo = KIND_LABELS[s.kind];
  const confStyle = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;

  // Focus trap: focus the dialog on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Escape key closes
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // Resolve messages
  const resolvedMessages = s.messageIds
    ?.map((id) => messageMap.get(id))
    .filter((m): m is InboxMessage => !!m);

  return (
    // Backdrop
    <div
      className={css({
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(3px)",
        animation: "modal-backdrop-in 0.2s ease-out",
        padding: "16px",
      })}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Triage suggestion: ${s.title}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={css((t) => ({
          background: t.colors.bg,
          borderRadius: "0.75rem",
          boxShadow: "0 24px 48px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1)",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          scrollbarWidth: "thin",
          animation: "modal-content-in 0.25s ease-out",
          "&:focus": { outline: "none" },
        }))}
      >
        {/* Header */}
        <div
          className={css((t) => ({
            padding: `${t.spacing(5)} ${t.spacing(6)} ${t.spacing(4)}`,
            borderBottom: `1px solid ${t.colors.borderLight}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: t.spacing(3),
          }))}
        >
          <div className={css({ flex: "1 1 0%", minWidth: 0 })}>
            {/* Kind + confidence */}
            <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), flexWrap: "wrap" }))}>
              <span
                className={css((t) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: t.spacing(1),
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: t.colors.textMuted,
                }))}
              >
                {kindInfo.icon} {kindInfo.label}
              </span>
              <span
                className={css({
                  fontSize: "0.72rem",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  padding: "2px 10px",
                  borderRadius: "999px",
                  letterSpacing: "0.02em",
                })}
                style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
              >
                {s.confidence} confidence
              </span>
            </div>
            {/* Title */}
            <h2 className={css((t) => ({ fontSize: "1.2rem", fontWeight: "700", marginTop: t.spacing(2), lineHeight: "1.3" }))}>
              {s.title}
            </h2>
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close detail view"
            className={css((t) => ({
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              borderRadius: t.radiusSm,
              cursor: "pointer",
              fontSize: "1.2rem",
              color: t.colors.textMuted,
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
              "&:hover": { background: t.colors.bgAlt, color: t.colors.text },
              "&:focus-visible": {
                outline: `2px solid ${t.colors.primary}`,
                outlineOffset: "2px",
              },
            }))}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={css((t) => ({ padding: `${t.spacing(5)} ${t.spacing(6)}` }))}>
          {/* Kind description */}
          <p className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, marginBottom: t.spacing(4), fontStyle: "italic" }))}>
            {kindInfo.desc}
          </p>

          {/* Rationale */}
          <DetailSection label="Rationale">
            <p className={css({ fontSize: "0.92rem", lineHeight: "1.6" })}>{s.rationale}</p>
          </DetailSection>

          {/* Mapped message previews */}
          {resolvedMessages && resolvedMessages.length > 0 && (
            <DetailSection label={`Affected Messages (${resolvedMessages.length})`}>
              <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
                {resolvedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={css((t) => ({
                      padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                      background: t.colors.bgAlt,
                      borderRadius: t.radiusSm,
                      border: `1px solid ${t.colors.borderLight}`,
                      fontSize: "0.85rem",
                    }))}
                  >
                    <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.spacing(2) }))}>
                      <span className={css({ fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 })}>
                        {msg.from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? msg.from}
                      </span>
                      <span className={css((t) => ({ fontSize: "0.75rem", color: t.colors.textMuted, flexShrink: 0 }))}>
                        {new Date(msg.date).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className={css((t) => ({ fontWeight: "500", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))}>
                      {msg.subject}
                    </div>
                    <div className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.8rem", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))}>
                      {msg.snippet}
                    </div>
                  </div>
                ))}
              </div>
              {s.messageIds && s.messageIds.length > resolvedMessages.length && (
                <p className={css((t) => ({ fontSize: "0.8rem", color: t.colors.textMuted, marginTop: t.spacing(2) }))}>
                  + {s.messageIds.length - resolvedMessages.length} message{s.messageIds.length - resolvedMessages.length !== 1 ? "s" : ""} not in current inbox view
                </p>
              )}
            </DetailSection>
          )}

          {/* Show raw IDs if no messages resolved */}
          {s.messageIds && s.messageIds.length > 0 && (!resolvedMessages || resolvedMessages.length === 0) && (
            <DetailSection label={`Message IDs (${s.messageIds.length})`}>
              <div className={css((t) => ({ fontFamily: "monospace", fontSize: "0.8rem", color: t.colors.textMuted, lineHeight: "1.7", wordBreak: "break-all" }))}>
                {s.messageIds.join(", ")}
              </div>
            </DetailSection>
          )}

          {/* Filter draft */}
          {s.filterDraft && (
            <DetailSection label="Filter Draft">
              <div
                className={css((t) => ({
                  padding: t.spacing(3),
                  background: t.colors.bgAlt,
                  borderRadius: t.radiusSm,
                  border: `1px solid ${t.colors.borderLight}`,
                  fontFamily: "monospace",
                  fontSize: "0.84rem",
                  lineHeight: "1.7",
                }))}
              >
                {s.filterDraft.from && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>from:</span> {s.filterDraft.from}</div>}
                {s.filterDraft.subjectContains && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>subject contains:</span> {s.filterDraft.subjectContains}</div>}
                {s.filterDraft.hasWords && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>has words:</span> {s.filterDraft.hasWords}</div>}
                {s.filterDraft.label && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>label:</span> {s.filterDraft.label}</div>}
                {s.filterDraft.archive !== undefined && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>archive:</span> {s.filterDraft.archive ? "yes" : "no"}</div>}
              </div>
            </DetailSection>
          )}

          {/* Questions */}
          {s.questions && s.questions.length > 0 && (
            <DetailSection label="Questions for You">
              <ul
                className={css((t) => ({
                  paddingLeft: t.spacing(5),
                  fontSize: "0.9rem",
                  lineHeight: "1.7",
                }))}
              >
                {s.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </DetailSection>
          )}

          {/* Metadata */}
          {lastRunAt && (
            <DetailSection label="Run Metadata">
              <div className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, lineHeight: "1.6" }))}>
                <div>Generated: {new Date(lastRunAt).toLocaleString()}</div>
                <div>Kind: {s.kind}</div>
                <div>Confidence: {s.confidence}</div>
              </div>
            </DetailSection>
          )}
        </div>

        {/* Footer actions */}
        <div
          className={css((t) => ({
            padding: `${t.spacing(4)} ${t.spacing(6)}`,
            borderTop: `1px solid ${t.colors.borderLight}`,
            display: "flex",
            alignItems: "center",
            gap: t.spacing(2),
            flexWrap: "wrap",
          }))}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkReviewed();
            }}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(4)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.text,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "600",
              transition: "all 0.15s",
              "&:hover": { background: t.colors.bgAlt },
            }))}
            style={isReviewed ? { borderColor: "#10b981", background: "#ecfdf5", color: "#10b981" } : undefined}
          >
            {isReviewed ? "✓ Reviewed" : "Mark reviewed"}
          </button>
          {isExecutable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowApprovalModal(true);
              }}
              className={css((t) => ({
                padding: `${t.spacing(2)} ${t.spacing(4)}`,
                border: "none",
                borderRadius: t.radiusSm,
                background: "#dc2626",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "700",
                transition: "background 0.15s",
                "&:hover": { background: "#b91c1c" },
              }))}
              title="Execute this action (requires confirmation)"
            >
              ⚡ Execute
            </button>
          )}
          {s.kind !== "needs_user_input" && !isExecutable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToast(`📋 Previewing: ${s.title}`);
              }}
              className={css((t) => ({
                padding: `${t.spacing(2)} ${t.spacing(4)}`,
                border: `1px solid ${t.colors.border}`,
                borderRadius: t.radiusSm,
                background: "transparent",
                color: t.colors.textMuted,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "500",
                transition: "background 0.15s",
                "&:hover": { background: t.colors.bgAlt },
              }))}
              title="Preview what this action would do (no changes applied)"
            >
              Review suggestion
            </button>
          )}
          {s.kind === "needs_user_input" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToast("✏️ Draft response — coming soon!");
              }}
              className={css((t) => ({
                padding: `${t.spacing(2)} ${t.spacing(4)}`,
                border: `1px solid ${t.colors.primary}`,
                borderRadius: t.radiusSm,
                background: "transparent",
                color: t.colors.primary,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "600",
                transition: "background 0.15s",
                "&:hover": { background: "rgba(37,99,235,0.06)" },
              }))}
            >
              Draft response
            </button>
          )}
          <div className={css({ flex: "1 1 0%" })} />
          <button
            onClick={onClose}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(4)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: t.colors.bgAlt,
              color: t.colors.textMuted,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "500",
              transition: "background 0.15s",
              "&:hover": { background: t.colors.borderLight },
            }))}
          >
            Close
          </button>
        </div>
      </div>

      {/* Approval confirmation modal */}
      {showApprovalModal && (
        <ApprovalConfirmModal
          suggestion={s}
          messageMap={messageMap}
          onClose={() => setShowApprovalModal(false)}
          onSuccess={(msg) => {
            setShowApprovalModal(false);
            onToast(msg);
            onClose();
          }}
        />
      )}
    </div>
  );
}

// --- Approval Confirmation Modal ---
function ApprovalConfirmModal({
  suggestion,
  messageMap,
  onClose,
  onSuccess,
}: {
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [status, setStatus] = useState<"confirm" | "executing" | "done" | "error">("confirm");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const kindInfo = KIND_LABELS[suggestion.kind];

  function getExecutionPlan() {
    if (suggestion.kind === "archive_bulk" && suggestion.messageIds) {
      return {
        scope: "archive_bulk" as const,
        endpoint: "/api/tools/apply_archive_bulk",
        payload: { action: "archive", messageIds: suggestion.messageIds },
        bodyFn: (tokenId: string) => ({ messageIds: suggestion.messageIds, approvalToken: tokenId }),
      };
    }
    if (suggestion.kind === "create_filter" && suggestion.filterDraft) {
      const rule = {
        from: suggestion.filterDraft.from || undefined,
        subject: suggestion.filterDraft.subjectContains || undefined,
        hasTheWord: suggestion.filterDraft.hasWords || undefined,
        label: suggestion.filterDraft.label || undefined,
        archive: suggestion.filterDraft.archive ?? false,
        markRead: false,
      };
      // Remove undefined keys for consistent hashing
      const cleanRule = JSON.parse(JSON.stringify(rule));
      return {
        scope: "create_filter" as const,
        endpoint: "/api/tools/create_filter",
        payload: cleanRule,
        bodyFn: (tokenId: string) => ({ rule: cleanRule, approvalToken: tokenId }),
      };
    }
    return null;
  }

  async function handleExecute() {
    const plan = getExecutionPlan();
    if (!plan) return;

    setStatus("executing");
    setErrorMsg(null);

    try {
      // Step 1: Request approval token
      const tokenRes = await fetch("/api/tools/request_approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: plan.scope, payload: plan.payload }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || `Failed to get approval token (${tokenRes.status})`);
      }

      const { tokenId } = await tokenRes.json();

      // Step 2: Execute mutation with token
      const execRes = await fetch(plan.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan.bodyFn(tokenId)),
      });

      if (!execRes.ok) {
        const err = await execRes.json().catch(() => ({}));
        throw new Error(err.error || `Action failed (${execRes.status})`);
      }

      setStatus("done");
      setTimeout(() => {
        onSuccess(`✅ ${suggestion.title} — executed successfully`);
      }, 1000);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Unknown error");
    }
  }

  const resolvedMessages = suggestion.messageIds
    ?.map((id) => messageMap.get(id))
    .filter((m): m is InboxMessage => !!m);

  return (
    <div
      className={css({
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "toast-in 0.2s ease-out",
        padding: "16px",
      })}
    >
      {/* Backdrop */}
      <div
        onClick={status === "executing" ? undefined : onClose}
        className={css({
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        })}
      />
      {/* Modal */}
      <div
        className={css((t) => ({
          position: "relative",
          background: t.colors.bg,
          borderRadius: "0.75rem",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          width: "min(500px, 90vw)",
          padding: t.spacing(6),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(4),
        }))}
      >
        {/* Header */}
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2) }))}>
          <span className={css({ fontSize: "1.4rem" })}>{kindInfo.icon}</span>
          <h3 className={css({ fontSize: "1.1rem", fontWeight: "700", margin: 0, lineHeight: "1.3" })}>
            Confirm: {suggestion.title}
          </h3>
        </div>

        {/* Warning */}
        <div
          className={css((t) => ({
            padding: t.spacing(3),
            background: "#fffbeb",
            border: "1px solid #fbbf24",
            borderRadius: t.radiusSm,
            fontSize: "0.85rem",
            color: "#92400e",
            fontWeight: "500",
            display: "flex",
            alignItems: "flex-start",
            gap: t.spacing(2),
            lineHeight: "1.5",
          }))}
        >
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>
            This will modify your Gmail.
            {suggestion.kind === "archive_bulk"
              ? " Messages will be removed from your inbox (reversible via unarchive)."
              : " A filter will be created that applies to future emails."}
          </span>
        </div>

        {/* Rationale */}
        <div className={css((t) => ({ fontSize: "0.88rem", color: t.colors.textMuted, lineHeight: "1.6" }))}>
          <p>{suggestion.rationale}</p>
        </div>

        {/* Affected messages */}
        {resolvedMessages && resolvedMessages.length > 0 && (
          <div className={css((t) => ({ fontSize: "0.82rem", maxHeight: "140px", overflowY: "auto", scrollbarWidth: "thin" }))}>
            <div className={css((t) => ({ fontWeight: "600", fontSize: "0.78rem", textTransform: "uppercase", color: t.colors.textMuted, marginBottom: t.spacing(1.5), letterSpacing: "0.04em" }))}>
              {resolvedMessages.length} message{resolvedMessages.length !== 1 ? "s" : ""} affected
            </div>
            {resolvedMessages.slice(0, 6).map((msg) => (
              <div key={msg.id} className={css((t) => ({ padding: `${t.spacing(1)} 0`, color: t.colors.text }))}>
                <span className={css({ fontWeight: "500" })}>{msg.from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? msg.from}</span>
                {" — "}
                <span className={css((t) => ({ color: t.colors.textMuted }))}>{msg.subject.length > 40 ? msg.subject.slice(0, 37) + "…" : msg.subject}</span>
              </div>
            ))}
            {resolvedMessages.length > 6 && (
              <div className={css((t) => ({ color: t.colors.textMuted, fontStyle: "italic", marginTop: t.spacing(1) }))}>
                +{resolvedMessages.length - 6} more
              </div>
            )}
          </div>
        )}

        {/* Filter draft preview */}
        {suggestion.filterDraft && (
          <div className={css((t) => ({ fontFamily: "monospace", fontSize: "0.82rem", background: t.colors.bgAlt, padding: t.spacing(3), borderRadius: t.radiusSm, border: `1px solid ${t.colors.borderLight}`, lineHeight: "1.6" }))}>
            {suggestion.filterDraft.from && <div>from: {suggestion.filterDraft.from}</div>}
            {suggestion.filterDraft.label && <div>label: {suggestion.filterDraft.label}</div>}
            {suggestion.filterDraft.archive && <div>archive: yes</div>}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className={css((t) => ({ padding: t.spacing(3), background: "#fef2f2", borderRadius: t.radiusSm, color: t.colors.error, fontSize: "0.85rem" }))}>
            {errorMsg}
          </div>
        )}

        {/* Success */}
        {status === "done" && (
          <div className={css((t) => ({ padding: t.spacing(3), background: "#ecfdf5", borderRadius: t.radiusSm, color: "#065f46", fontSize: "0.88rem", fontWeight: "600", textAlign: "center" }))}>
            ✅ Action completed successfully
          </div>
        )}

        {/* Buttons */}
        <div className={css((t) => ({ display: "flex", gap: t.spacing(3), justifyContent: "flex-end", paddingTop: t.spacing(2), borderTop: `1px solid ${t.colors.borderLight}` }))}>
          {status !== "done" && (
            <button
              onClick={onClose}
              disabled={status === "executing"}
              className={css((t) => ({
                padding: `${t.spacing(2.5)} ${t.spacing(5)}`,
                border: `1px solid ${t.colors.border}`,
                borderRadius: t.radiusSm,
                background: "transparent",
                fontSize: "0.88rem",
                fontWeight: "500",
                "&:hover": { background: t.colors.bgAlt },
              }))}
              style={status === "executing" ? { cursor: "not-allowed", opacity: 0.5 } : { cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
          {(status === "confirm" || status === "error") && (
            <button
              onClick={handleExecute}
              className={css((t) => ({
                padding: `${t.spacing(2.5)} ${t.spacing(5)}`,
                border: "none",
                borderRadius: t.radiusSm,
                background: "#dc2626",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.88rem",
                fontWeight: "700",
                transition: "background 0.15s",
                "&:hover": { background: "#b91c1c" },
              }))}
            >
              {status === "error" ? "Retry" : "⚡ Confirm & Execute"}
            </button>
          )}
          {status === "executing" && (
            <div className={css((t) => ({ padding: `${t.spacing(2.5)} ${t.spacing(5)}`, fontSize: "0.88rem", fontWeight: "600", color: t.colors.textMuted }))}>
              Executing…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Detail section helper ---
function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={css((t) => ({ marginBottom: t.spacing(5) }))}>
      <h3
        className={css((t) => ({
          fontSize: "0.78rem",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: t.colors.textMuted,
          marginBottom: t.spacing(2),
        }))}
      >
        {label}
      </h3>
      {children}
    </div>
  );
}
