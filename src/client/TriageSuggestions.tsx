import { useState, useEffect } from "react";
import { css } from "@flow-css/core/css";

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

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#ef4444",
};

export default function TriageSuggestions({ onAuthLost }: { onAuthLost: () => void }) {
  const [suggestions, setSuggestions] = useState<TriageSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

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

  return (
    <section
      className={css((t) => ({
        marginTop: t.spacing(6),
        paddingTop: t.spacing(4),
        borderTop: `2px solid ${t.colors.border}`,
      }))}
    >
      {/* Header row */}
      <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: (t) => t.spacing(3) })}>
        <div>
          <h2 className={css({ fontSize: "1.15rem", fontWeight: "700", margin: "0" })}>🧹 Triage Suggestions</h2>
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
              fontSize: "0.9rem",
              fontWeight: "600",
              transition: "background 0.15s",
            })),
            loading || initialLoading
              ? css((t) => ({ background: t.colors.borderLight, color: t.colors.textMuted, cursor: "not-allowed" }))
              : css((t) => ({ background: t.colors.primary, color: "#fff", cursor: "pointer", "&:hover": { background: t.colors.primaryHover } })),
          ].join(" ")}
        >
          {loading ? "Analyzing…" : suggestions ? "Regenerate" : "Generate Triage Suggestions"}
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
          }))}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p
          className={css((t) => ({
            textAlign: "center",
            padding: t.spacing(8),
            color: t.colors.textMuted,
            fontSize: "0.95rem",
          }))}
        >
          Analyzing your inbox — this may take a moment…
        </p>
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
            <SuggestionCard key={i} suggestion={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({ suggestion: s }: { suggestion: TriageSuggestion }) {
  const kindInfo = KIND_LABELS[s.kind];
  const confColor = CONFIDENCE_COLORS[s.confidence] ?? CONFIDENCE_COLORS.low;

  return (
    <div
      className={css((t) => ({
        padding: t.spacing(4),
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        background: t.colors.bg,
        boxShadow: t.shadow,
      }))}
    >
      {/* Top row: kind badge + confidence */}
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
          className={css({ fontSize: "0.7rem", fontWeight: "700", textTransform: "uppercase" })}
          style={{ color: confColor }}
        >
          {s.confidence} confidence
        </span>
      </div>

      {/* Title */}
      <h3 className={css((t) => ({ fontSize: "1rem", fontWeight: "600", marginTop: t.spacing(2) }))}>{s.title}</h3>

      {/* Rationale */}
      <p className={css((t) => ({ fontSize: "0.88rem", color: t.colors.textMuted, marginTop: t.spacing(1), lineHeight: "1.5" }))}>{s.rationale}</p>

      {/* Message IDs */}
      {s.messageIds && s.messageIds.length > 0 && (
        <div className={css((t) => ({ marginTop: t.spacing(3), fontSize: "0.82rem", color: t.colors.textMuted }))}>
          <strong>{s.messageIds.length} message{s.messageIds.length !== 1 ? "s" : ""}</strong>
          <span className={css((t) => ({ marginLeft: t.spacing(1), fontFamily: "monospace", fontSize: "0.75rem" }))}>
            ({s.messageIds.slice(0, 5).join(", ")}
            {s.messageIds.length > 5 ? `, +${s.messageIds.length - 5} more` : ""})
          </span>
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
    </div>
  );
}
