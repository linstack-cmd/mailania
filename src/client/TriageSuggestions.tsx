import { useState, useEffect } from "react";
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

const KIND_LABELS: Record<TriageSuggestion["kind"], { icon: string; label: string }> = {
  archive_bulk: { icon: "📦", label: "Archive" },
  create_filter: { icon: "🔀", label: "Filter" },
  needs_user_input: { icon: "❓", label: "Needs Input" },
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string }> = {
  high: { bg: "#ecfdf5", text: "#065f46" },
  medium: { bg: "#fffbeb", text: "#92400e" },
  low: { bg: "#fef2f2", text: "#991b1b" },
};

// --- Skeleton shimmer (keyframes in styles.css) ---
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

  // Build messageId → subject lookup from inbox
  const subjectMap = new Map<string, string>();
  for (const m of messages) {
    subjectMap.set(m.id, m.subject);
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
        // Silently ignore — user can still generate fresh suggestions
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

  return (
    <section>
      {/* Header row */}
      <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: (t) => t.spacing(3) })}>
        <div>
          <h2 className={css({ fontSize: "1.15rem", fontWeight: "700", margin: "0" })}>🧹 Triage</h2>
          {lastRunAt && !loading && (
            <p className={css((t) => ({ fontSize: "0.75rem", color: t.colors.textMuted, margin: `${t.spacing(1)} 0 0` }))}>
              Last run: {new Date(lastRunAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchSuggestions}
          disabled={loading || initialLoading}
          className={[
            css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(4)}`,
              border: "none",
              borderRadius: t.radiusSm,
              fontSize: "0.85rem",
              fontWeight: "600",
              transition: "background 0.15s",
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
        </div>
      )}

      {/* Empty result */}
      {suggestions && suggestions.length === 0 && !loading && (
        <p
          className={css((t) => ({
            textAlign: "center",
            padding: t.spacing(6),
            color: t.colors.textMuted,
          }))}
        >
          No suggestions right now — your inbox looks good! 🎉
        </p>
      )}

      {/* Suggestion cards */}
      {suggestions && suggestions.length > 0 && !loading && (
        <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(3), marginTop: t.spacing(4) }))}>
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              suggestion={s}
              subjectMap={subjectMap}
              isReviewed={reviewedIds.has(i)}
              onMarkReviewed={() => markReviewed(i)}
              onToast={setToastMsg}
            />
          ))}
        </div>
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

function SuggestionCard({
  suggestion: s,
  subjectMap,
  isReviewed,
  onMarkReviewed,
  onToast,
}: {
  suggestion: TriageSuggestion;
  subjectMap: Map<string, string>;
  isReviewed: boolean;
  onMarkReviewed: () => void;
  onToast: (msg: string) => void;
}) {
  const kindInfo = KIND_LABELS[s.kind];
  const confStyle = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;

  // Resolve messageIds to subject previews where available
  const messageSubjects = s.messageIds
    ?.map((id) => subjectMap.get(id))
    .filter((subj): subj is string => !!subj)
    .map((subj) => (subj.length > 45 ? subj.slice(0, 42) + "…" : subj));

  return (
    <div
      tabIndex={0}
      role="article"
      aria-label={s.title}
      className={css((t) => ({
        padding: t.spacing(4),
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        background: t.colors.bg,
        boxShadow: t.shadow,
        transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
        "&:focus-visible": {
          outline: `2px solid ${t.colors.primary}`,
          outlineOffset: "2px",
          boxShadow: "0 0 0 4px rgba(37,99,235,0.12)",
        },
      }))}
      style={isReviewed ? { borderColor: "#10b981", background: "#f0fdf4" } : undefined}
    >
      {/* Top row: kind badge + confidence pill */}
      <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: (t) => t.spacing(2) })}>
        <span
          className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(1),
            fontSize: "0.75rem",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: t.colors.textMuted,
          }))}
        >
          {kindInfo.icon} {kindInfo.label}
        </span>
        <span
          className={css({
            fontSize: "0.75rem",
            fontWeight: "700",
            textTransform: "uppercase",
            padding: "2px 10px",
            borderRadius: "999px",
            letterSpacing: "0.02em",
          })}
          style={{ background: confStyle.bg, color: confStyle.text }}
        >
          {s.confidence}
        </span>
      </div>

      {/* Title */}
      <h3 className={css((t) => ({ fontSize: "1rem", fontWeight: "600", marginTop: t.spacing(2) }))}>{s.title}</h3>

      {/* Rationale */}
      <p className={css((t) => ({ fontSize: "0.88rem", color: t.colors.textMuted, marginTop: t.spacing(1), lineHeight: "1.5" }))}>{s.rationale}</p>

      {/* Message references — show subjects if available, otherwise IDs */}
      {s.messageIds && s.messageIds.length > 0 && (
        <div className={css((t) => ({ marginTop: t.spacing(3), fontSize: "0.82rem", color: t.colors.textMuted }))}>
          <strong>{s.messageIds.length} message{s.messageIds.length !== 1 ? "s" : ""}</strong>
          {messageSubjects && messageSubjects.length > 0 ? (
            <ul className={css((t) => ({ margin: `${t.spacing(1)} 0 0`, paddingLeft: t.spacing(4), fontSize: "0.8rem", lineHeight: "1.6" }))}>
              {messageSubjects.slice(0, 5).map((subj, i) => (
                <li key={i}>{subj}</li>
              ))}
              {messageSubjects.length > 5 && <li>+{messageSubjects.length - 5} more</li>}
            </ul>
          ) : (
            <span className={css((t) => ({ marginLeft: t.spacing(1), fontFamily: "monospace", fontSize: "0.75rem" }))}>
              ({s.messageIds.slice(0, 5).join(", ")}
              {s.messageIds.length > 5 ? `, +${s.messageIds.length - 5} more` : ""})
            </span>
          )}
        </div>
      )}

      {/* Filter draft */}
      {s.filterDraft && (
        <div
          className={css((t) => ({
            marginTop: t.spacing(3),
            padding: t.spacing(3),
            background: t.colors.bgAlt,
            borderRadius: t.radiusSm,
            fontSize: "0.82rem",
            fontFamily: "monospace",
            lineHeight: "1.6",
          }))}
        >
          <div className={css((t) => ({ fontWeight: "600", marginBottom: t.spacing(1), fontFamily: "inherit", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.03em", color: t.colors.textMuted }))}>
            Filter Draft
          </div>
          {s.filterDraft.from && <div>from: {s.filterDraft.from}</div>}
          {s.filterDraft.subjectContains && <div>subject contains: {s.filterDraft.subjectContains}</div>}
          {s.filterDraft.hasWords && <div>has words: {s.filterDraft.hasWords}</div>}
          {s.filterDraft.label && <div>label: {s.filterDraft.label}</div>}
          {s.filterDraft.archive !== undefined && <div>archive: {s.filterDraft.archive ? "yes" : "no"}</div>}
        </div>
      )}

      {/* Questions */}
      {s.questions && s.questions.length > 0 && (
        <ul
          className={css((t) => ({
            marginTop: t.spacing(3),
            paddingLeft: t.spacing(5),
            fontSize: "0.88rem",
            color: t.colors.text,
            lineHeight: "1.6",
          }))}
        >
          {s.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}

      {/* Action affordances — local UI state only, no Gmail mutations */}
      <div
        className={css((t) => ({
          marginTop: t.spacing(3),
          paddingTop: t.spacing(3),
          borderTop: `1px solid ${t.colors.borderLight}`,
          display: "flex",
          alignItems: "center",
          gap: t.spacing(2),
          flexWrap: "wrap",
        }))}
      >
        <button
          onClick={onMarkReviewed}
          className={css((t) => ({
            padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
            border: `1px solid ${t.colors.border}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.text,
            cursor: "pointer",
            fontSize: "0.82rem",
            fontWeight: "600",
            transition: "all 0.15s",
            "&:hover": { background: t.colors.bgAlt },
          }))}
          style={isReviewed ? { borderColor: "#10b981", background: "#ecfdf5", color: "#10b981" } : undefined}
        >
          {isReviewed ? "✓ Reviewed" : "Mark reviewed"}
        </button>
        {s.kind !== "needs_user_input" && (
          <button
            onClick={() => onToast(`📋 Previewing: ${s.title}`)}
            className={css((t) => ({
              padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.textMuted,
              cursor: "pointer",
              fontSize: "0.82rem",
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
            onClick={() => onToast("✏️ Draft response — coming soon!")}
            className={css((t) => ({
              padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.primary}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.primary,
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: "600",
              transition: "background 0.15s",
              "&:hover": { background: "rgba(37,99,235,0.06)" },
            }))}
          >
            Draft response
          </button>
        )}
      </div>
    </div>
  );
}
