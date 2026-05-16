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
        padding: t.spacing(5),
        borderRadius: t.radiusCard,
        background: "rgba(255, 255, 255, 0.32)",
        backdropFilter: "blur(14px) saturate(1.4)",
        border: "1px solid rgba(255, 255, 255, 0.6)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
        transition: "all 0.3s ease",
        cursor: "pointer",
        "&:hover": {
          background: "rgba(255, 255, 255, 0.42)",
          transform: "translateY(-2px)",
          borderColor: "rgba(255, 255, 255, 0.75)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -8px rgba(255, 79, 138, 0.35)",
        },
        "&:focus-visible": {
          outline: "2px solid #FF4F8A",
          outlineOffset: "2px",
        },
        "@media (max-width: 640px)": {
          padding: t.spacing(4),
        },
      }))}
    >
      {/* Morning greeting eyebrow */}
      {!isTriaging && (
        <div className={css((t) => ({
          fontSize: t.fontSize.xs,
          fontWeight: "600",
          textTransform: "lowercase",
          letterSpacing: "0.05em",
          color: "#A87B95",
          marginBottom: t.spacing(3),
        }))}>
          good {getTimeOfDay()}{userName ? `, ${userName}` : ""}
        </div>
      )}

      {isTriaging ? (
        // TRIAGE RUNNING STATE
        <>
          {/* Jelly icon with ✦ symbol */}
          <div className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(3),
            marginBottom: t.spacing(3),
          }))}>
            <div className={css((t) => ({
              width: "48px",
              height: "48px",
              minWidth: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
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
            }))}>
              <h2 className={css((t) => ({
                fontSize: "19px",
                fontFamily: '"Instrument Serif", serif',
                fontWeight: "400",
                margin: 0,
                color: "#2A0E1A",
                lineHeight: "1.2",
              }))}>
                reading your inbox
              </h2>
              <p className={css((t) => ({
                fontSize: t.fontSize.xs,
                color: "#A87B95",
                margin: `${t.spacing(0.5)} 0 0`,
              }))}>
                {triageStage || "analyzing…"}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className={css((t) => ({
            marginBottom: t.spacing(2),
          }))}>
            <div className={css((t) => ({
              height: "8px",
              borderRadius: "4px",
              background: "rgba(255, 255, 255, 0.3)",
              overflow: "hidden",
              boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.05)",
            }))}>
              <div
                style={{
                  width: `${triageProgress}%`,
                  transition: "width 0.4s ease-out",
                }}
                className={css((t) => ({
                  height: "100%",
                  borderRadius: "4px",
                  background: "linear-gradient(90deg, #FF4F8A, #FF6FA0)",
                  boxShadow: "0 0 8px rgba(255, 79, 138, 0.4)",
                }))}
              />
            </div>
          </div>

          {/* Progress label */}
          <div className={css((t) => ({
            fontSize: t.fontSize.xs,
            color: "#A87B95",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }))}>
            <span>{triageProgress}% complete</span>
          </div>
        </>
      ) : isIdle ? (
        // IDLE/EMPTY STATE (Mint jelly)
        <>
          <div className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(3),
          }))}>
            <div className={css((t) => ({
              width: "48px",
              height: "48px",
              minWidth: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(140, 220, 180, 0.75), rgba(160, 235, 195, 0.85))",
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
                fontSize: t.fontSize.xs,
                color: "#A87B95",
                margin: `${t.spacing(0.5)} 0 0`,
              }))}>
                nothing waiting on you
              </p>
            </div>
          </div>
          
          {/* Last triage stats */}
          {lastTriageMessages !== undefined && lastTriageSuggestions !== undefined && (
            <div className={css((t) => ({
              marginTop: t.spacing(3),
              paddingTop: t.spacing(3),
              borderTop: "1px solid rgba(255, 255, 255, 0.3)",
              display: "flex",
              gap: t.spacing(4),
              fontSize: t.fontSize.xs,
              color: "#A87B95",
            }))}>
              <span>{lastTriageMessages} message{lastTriageMessages !== 1 ? "s" : ""}</span>
              <span>→</span>
              <span>{lastTriageSuggestions} suggestion{lastTriageSuggestions !== 1 ? "s" : ""}</span>
            </div>
          )}
        </>
      ) : (
        // PILE COUNT STATE (Pink jelly - default)
        <>
          <div className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(3),
          }))}>
            <div className={css((t) => ({
              width: "48px",
              height: "48px",
              minWidth: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
              boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(120, 30, 80, 0.2), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
              border: "1px solid rgba(255, 200, 220, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: "700",
              color: "white",
            }))}>
              {pileCount}
            </div>
            <div className={css((t) => ({
              flex: 1,
              minWidth: 0,
            }))}>
              <h2 className={css((t) => ({
                fontSize: "19px",
                fontFamily: '"Instrument Serif", serif',
                fontWeight: "400",
                margin: 0,
                color: "#2A0E1A",
                lineHeight: "1.2",
              }))}>
                today's pile
              </h2>
              <p className={css((t) => ({
                fontSize: t.fontSize.xs,
                color: "#A87B95",
                margin: `${t.spacing(0.5)} 0 0`,
              }))}>
                pending suggestions awaiting your review
              </p>
            </div>
            {onViewPile && (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2A0E1A"
                strokeWidth="2"
                style={{ flexShrink: 0 }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
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
