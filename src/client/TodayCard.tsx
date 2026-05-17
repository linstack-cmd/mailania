/**
 * TodayCard — Displays inbox triage status with three states
 * 
 * States:
 * 1. Pile Count (default): Shows pending suggestion count with jelly indicator
 * 2. Triage Running: Shows progress bar with animation
 * 3. Idle/Empty (mint): Shows last triage stats, everything caught up
 */

import { css } from "@flow-css/core/css";

export interface TodayCardProps {
  /** Current number of pending suggestions (pile size) */
  pileCount: number;
  
  /** Triage progress if currently running (0-100) */
  triageProgress?: number | null;
  
  /** Stage name for progress display */
  triageStage?: string;
  
  /** Total messages found in last triage */
  lastTriageMessages?: number;
  
  /** Total suggestions from last triage */
  lastTriageSuggestions?: number;
  
  /** Whether inbox is idle (zero unread) */
  isIdle?: boolean;
  
  /** User's first name for greeting */
  userName?: string;
  
  /** Suggestion kinds summary (e.g. "archive · filter · reply") */
  kindSummary?: string;
  
  /** Callback when user clicks to view pile */
  onViewPile?: () => void;
}

export function TodayCard({
  pileCount,
  triageProgress,
  triageStage,
  lastTriageMessages,
  lastTriageSuggestions,
  isIdle = false,
  userName,
  kindSummary,
  onViewPile,
}: TodayCardProps) {
  const isTriaging = triageProgress !== undefined && triageProgress !== null;
  
  return (
    <div
      role={onViewPile ? "button" : undefined}
      tabIndex={onViewPile ? 0 : undefined}
      onClick={onViewPile}
      onKeyDown={(e) => {
        if (onViewPile && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onViewPile();
        }
      }}
      className={css((t) => ({
        padding: "12px 14px",
        borderRadius: "24px",
        background: "rgba(255, 255, 255, 0.60)",
        backdropFilter: "blur(24px) saturate(1.6)",
        border: "1px solid rgba(255, 255, 255, 0.85)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
        transition: "all 0.3s ease",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        minHeight: "80px",
        "&:hover": {
          background: "rgba(255, 255, 255, 0.65)",
          transform: "translateY(-2px)",
          borderColor: "rgba(255, 255, 255, 0.95)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 16px 40px rgba(255, 79, 138, 0.4)",
        },
        "&:focus-visible": {
          outline: "2px solid #FF4F8A",
          outlineOffset: "2px",
        },
      }))}
    >

      {isTriaging ? (
        // TRIAGE RUNNING STATE
        <>
          <div className={css((t) => ({
            width: "50px",
            height: "50px",
            minWidth: "50px",
            borderRadius: "16px",
            background: "rgba(255, 79, 138, 0.85)",
            boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(120, 30, 80, 0.2), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
            border: "1px solid rgba(255, 200, 220, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            fontWeight: "700",
            color: "white",
          }))}>
            ✦
          </div>
          <div className={css((t) => ({
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(1),
          }))}>
            <h2 className={css((t) => ({
              fontSize: "19px",
              fontFamily: '"Instrument Serif", serif',
              fontWeight: "400",
              margin: 0,
              color: "#2A0E1A",
              lineHeight: "1.2",
            }))}>
              reading your{" "}
              <span style={{ fontStyle: "italic" }}>inbox</span>
            </h2>
            {/* Progress bar */}
            <div className={css((t) => ({
              height: "8px",
              borderRadius: "999px",
              background: "rgba(255, 255, 255, 0.3)",
              overflow: "hidden",
            }))}>
              <div
                style={{
                  width: `${triageProgress}%`,
                  transition: "width 0.4s ease-out",
                }}
                className={css((t) => ({
                  height: "100%",
                  background: "rgba(255, 79, 138, 0.85)",
                }))}
              />
            </div>
            <p className={css((t) => ({
              fontSize: "11px",
              color: "#A87B95",
              fontWeight: "500",
              margin: 0,
            }))}>
              {triageProgress}% · found 3
            </p>
          </div>
        </>
      ) : isIdle ? (
        // IDLE/EMPTY STATE (Mint jelly)
        <>
          <div className={css((t) => ({
            width: "50px",
            height: "50px",
            minWidth: "50px",
            borderRadius: "16px",
            background: "rgba(140, 220, 180, 0.75)",
            boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(60, 100, 80, 0.15), 0 12px 32px -12px rgba(140, 220, 180, 0.3)",
            border: "1px solid rgba(200, 240, 220, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            fontWeight: "700",
            color: "white",
          }))}>
            ✓
          </div>
          <div className={css((t) => ({
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(0.5),
          }))}>
            <h2 className={css((t) => ({
              fontSize: "19px",
              fontFamily: '"Instrument Serif", serif',
              fontWeight: "400",
              margin: 0,
              color: "#2A0E1A",
              lineHeight: "1.2",
            }))}>
              nothing waiting on you
            </h2>
            <p className={css((t) => ({
              fontSize: "12px",
              color: "#A87B95",
              fontWeight: "500",
              margin: 0,
            }))}>
              last triage 2h ago · 47 archived
            </p>
          </div>
        </>
      ) : (
        // PILE COUNT STATE (Pink jelly - default)
        <>
          <div className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(3),
            flex: 1,
            minWidth: 0,
          }))}>
            <div className={css((t) => ({
              width: "50px",
              height: "50px",
              minWidth: "50px",
              borderRadius: "16px",
              background: "rgba(255, 79, 138, 0.85)",
              boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(120, 30, 80, 0.2), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
              border: "1px solid rgba(255, 200, 220, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontFamily: '"Instrument Serif", serif',
              fontWeight: "400",
              color: "white",
            }))}>
              {pileCount}
            </div>
            <div className={css((t) => ({
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: t.spacing(0.5),
            }))}>
              <h2 className={css((t) => ({
                fontSize: "19px",
                fontFamily: '"Instrument Serif", serif',
                fontWeight: "400",
                margin: 0,
                color: "#2A0E1A",
                lineHeight: "1.2",
              }))}>
                today's{" "}
                <span style={{ fontStyle: "italic" }}>pile</span>
              </h2>
              <p style={{
                fontSize: "12px",
                color: "#A87B95",
                fontWeight: 500,
                margin: 0,
                whiteSpace: "normal",
                overflow: "visible",
                textOverflow: "clip",
                display: "block",
                width: "100%",
              }}>
                {kindSummary || "pending suggestions"}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
