/**
 * PileScreen — Review all pending suggestions in stacked glass cards
 * 
 * Form factors:
 * - Phone: Full-screen view, navigated from TodayCard chevron
 * - Tablet/Desktop: Right pane in split view
 */

import { useState } from "react";
import { css } from "@flow-css/core/css";

export interface Suggestion {
  id: string;
  kind: "digest" | "needs_user_input" | "archive" | "filter";
  count: number;
  title: string;
  subtitle?: string;
  actions: string[];
  isApproved?: boolean;
}

export interface PileScreenProps {
  suggestions: Suggestion[];
  isLoading?: boolean;
  onApproveSuggestion?: (id: string) => void;
  onViewDetail?: (id: string) => void;
  onBack?: () => void;
  isMobileView?: boolean;
}

const JELLY_COLORS: Record<string, { bg: string; icon: string }> = {
  "archive": { bg: "linear-gradient(135deg, rgba(140, 220, 180, 0.75), rgba(160, 235, 195, 0.85))", icon: "📁" }, // mint
  "filter": { bg: "linear-gradient(135deg, rgba(255, 200, 100, 0.75), rgba(255, 220, 130, 0.85))", icon: "🎯" }, // butter
  "needs_user_input": { bg: "linear-gradient(135deg, rgba(255, 140, 130, 0.75), rgba(255, 160, 150, 0.85))", icon: "⚡" }, // coral
  "digest": { bg: "linear-gradient(135deg, rgba(200, 150, 220, 0.75), rgba(220, 170, 240, 0.85))", icon: "📬" }, // lilac
};

export function PileScreen({
  suggestions,
  isLoading = false,
  onApproveSuggestion,
  onViewDetail,
  onBack,
  isMobileView = false,
}: PileScreenProps) {
  return (
    <div
      className={css((t) => ({
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "transparent",
        "@media (max-width: 640px)": {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          background: "rgba(255, 255, 255, 0.32)",
          backdropFilter: "blur(14px) saturate(1.4)",
        },
      }))}
    >
      {/* Mobile header with back button */}
      {isMobileView && (
        <div
          className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(2),
            padding: `${t.spacing(3)} ${t.spacing(4)}`,
            borderBottom: "1px solid rgba(255, 255, 255, 0.3)",
            background: "transparent",
            "@media (min-width: 641px)": {
              display: "none",
            },
          }))}
        >
          <button
            onClick={onBack}
            className={css((t) => ({
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "#2A0E1A",
              display: "flex",
              alignItems: "center",
              fontSize: "20px",
              transition: "opacity 0.15s",
              "&:hover": { opacity: 0.75 },
              "&:active": { transform: "scale(0.96)" },
            }))}
          >
            ‹
          </button>
          <h1
            className={css((t) => ({
              fontSize: "19px",
              fontFamily: '"Instrument Serif", serif',
              fontStyle: "italic",
              fontWeight: "400",
              margin: 0,
              color: "#2A0E1A",
            }))}
          >
            review pile
          </h1>
        </div>
      )}

      {/* Scrollable cards area */}
      <div
        className={css((t) => ({
          flex: 1,
          overflowY: "auto",
          padding: t.spacing(3),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(2),
          "@media (max-width: 640px)": {
            padding: t.spacing(2),
            paddingBottom: t.spacing(6),
          },
        }))}
      >
        {isLoading ? (
          <div
            className={css((t) => ({
              textAlign: "center",
              color: "#A87B95",
              fontSize: t.fontSize.sm,
              padding: t.spacing(4),
            }))}
          >
            Loading suggestions…
          </div>
        ) : suggestions.length === 0 ? (
          <div
            className={css((t) => ({
              textAlign: "center",
              color: "#A87B95",
              fontSize: t.fontSize.sm,
              padding: t.spacing(4),
            }))}
          >
            All caught up!
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <PileCard
              key={suggestion.id}
              suggestion={suggestion}
              onApprove={() => onApproveSuggestion?.(suggestion.id)}
              onViewDetail={() => onViewDetail?.(suggestion.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface PileCardProps {
  suggestion: Suggestion;
  onApprove: () => void;
  onViewDetail: () => void;
}

function PileCard({ suggestion, onApprove, onViewDetail }: PileCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const colorSet = JELLY_COLORS[suggestion.kind] || JELLY_COLORS.archive;

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsApproving(true);
    // Run animation for 300ms
    setTimeout(() => {
      onApprove();
      setIsApproving(false);
    }, 300);
  };

  return (
    <div
      className={css((t) => ({
        borderRadius: "16px",
        background: "rgba(255, 255, 255, 0.32)",
        backdropFilter: "blur(14px) saturate(1.4)",
        border: "1px solid rgba(255, 255, 255, 0.6)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
        padding: t.spacing(3),
        transition: "opacity 300ms ease, transform 300ms ease",
        cursor: "pointer",
        "&:hover": {
          background: "rgba(255, 255, 255, 0.42)",
          transform: "translateY(-2px)",
          borderColor: "rgba(255, 255, 255, 0.75)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -8px rgba(255, 79, 138, 0.35)",
        },
      }))}
      style={{
        opacity: isApproving ? 0 : 1,
        transform: isApproving ? "translateY(-8px)" : "translateY(0)",
      }}
      role="button"
      tabIndex={0}
      onClick={onViewDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewDetail();
        }
      }}
    >
      {/* Jelly tile + Title + Actions */}
      <div
        className={css((t) => ({
          display: "flex",
          alignItems: "flex-start",
          gap: t.spacing(3),
          marginBottom: t.spacing(2),
        }))}
      >
        {/* Jelly tile with count */}
        <div
          className={css((t) => ({
            width: "56px",
            height: "56px",
            minWidth: "56px",
            borderRadius: "12px",
            boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(0, 0, 0, 0.1), 0 12px 32px -12px rgba(255, 79, 138, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            fontSize: "20px",
            fontWeight: "700",
            color: "white",
          }))}
          style={{ background: colorSet.bg }}
        >
          <span style={{ fontSize: "14px" }}>{colorSet.icon}</span>
          <span style={{ fontSize: "16px" }}>{suggestion.count}</span>
        </div>

        {/* Title + Subtitle */}
        <div
          className={css((t) => ({
            flex: 1,
            minWidth: 0,
          }))}
        >
          <h3
            className={css((t) => ({
              fontSize: "18px",
              fontFamily: '"Instrument Serif", serif',
              fontWeight: "400",
              margin: 0,
              color: "#2A0E1A",
              lineHeight: "1.2",
            }))}
          >
            {suggestion.title}
          </h3>
          {suggestion.subtitle && (
            <p
              className={css((t) => ({
                fontSize: t.fontSize.xs,
                color: "#A87B95",
                margin: `${t.spacing(0.5)} 0 0`,
              }))}
            >
              {suggestion.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Action pills */}
      <div
        className={css((t) => ({
          display: "flex",
          gap: t.spacing(1.5),
          flexWrap: "wrap",
          marginBottom: t.spacing(2.5),
        }))}
      >
        {suggestion.actions.map((action, idx) => (
          <button
            key={idx}
            className={css((t) => ({
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#2A0E1A",
              borderRadius: "999px",
              padding: `${t.spacing(0.75)} ${t.spacing(1.5)}`,
              fontSize: t.fontSize.xs,
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.15s",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.25)",
                borderColor: "rgba(255, 255, 255, 0.5)",
              },
              "&:active": {
                transform: "scale(0.96)",
              },
            }))}>
              {action}
          </button>
        ))}
      </div>

      {/* Approve button (pink jelly) */}
      <button
        onClick={handleApprove}
        className={css((t) => ({
          width: "100%",
          background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
          border: "none",
          color: "white",
          borderRadius: "8px",
          padding: `${t.spacing(2)} ${t.spacing(3)}`,
          fontSize: t.fontSize.sm,
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: t.spacing(1.5),
          boxShadow: "0 4px 12px rgba(255, 79, 138, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
          "&:hover": {
            boxShadow: "0 6px 16px rgba(255, 79, 138, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
          },
          "&:active": {
            transform: "scale(0.96)",
          },
        }))}
      >
        <span>✓</span>
        <span>approve</span>
      </button>
    </div>
  );
}
