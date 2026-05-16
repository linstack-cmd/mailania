/**
 * Phase 7: Polish screens and layout utilities
 * 
 * Includes:
 * - Done screen (celebration)
 * - Partial failure screen (error handling)
 * - AI typing indicator
 * - Layout shell helpers
 */

import { css } from "@flow-css/core/css";
import React from "react";

/* ============ DONE SCREEN ============ */

export interface DoneScreenProps {
  stats?: {
    messagesProcessed?: number;
    suggestionsGenerated?: number;
  };
  onClose?: () => void;
  userName?: string;
}

export function DoneScreen({ stats, onClose, userName }: DoneScreenProps) {
  return (
    <div
      className={css((t) => ({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: t.spacing(4),
        background: "transparent",
        textAlign: "center",
      }))}
    >
      {/* Large mint jelly with ✦ */}
      <div
        className={css((t) => ({
          width: "110px",
          height: "110px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, rgba(140, 220, 180, 0.75), rgba(160, 235, 195, 0.85))",
          boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(60, 100, 80, 0.15), 0 24px 64px -12px rgba(140, 220, 180, 0.3)",
          border: "1px solid rgba(200, 240, 220, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "56px",
          fontWeight: "700",
          color: "white",
          marginBottom: t.spacing(6),
        }))}>
        ✦
      </div>

      {/* "all done" title */}
      <h1
        className={css((t) => ({
          fontSize: "48px",
          fontFamily: '"Instrument Serif", serif',
          fontWeight: "400",
          margin: 0,
          color: "#2A0E1A",
          marginBottom: t.spacing(2),
          lineHeight: "1.2",
          "@media (max-width: 640px)": {
            fontSize: "36px",
          },
        }))}>
        all done
      </h1>

      {/* Stats subtitle */}
      {stats && (
        <p
          className={css((t) => ({
            fontSize: t.fontSize.lg,
            color: "#A87B95",
            margin: `0 0 ${t.spacing(6)} 0`,
            maxWidth: "500px",
            lineHeight: t.lineHeight.relaxed,
          }))}
        >
          {stats.messagesProcessed} message{stats.messagesProcessed !== 1 ? "s" : ""} →{" "}
          {stats.suggestionsGenerated} suggestion{stats.suggestionsGenerated !== 1 ? "s" : ""}
        </p>
      )}

      {/* Accent message */}
      <p
        className={css((t) => ({
          fontSize: t.fontSize.base,
          color: "#A87B95",
          fontStyle: "italic",
          margin: 0,
        }))}
      >
        have a great morning ☀
      </p>
    </div>
  );
}

/* ============ PARTIAL FAILURE SCREEN ============ */

export interface PartialFailureScreenProps {
  errorMessage?: string;
  reason?: string;
  onRetry?: () => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

export function PartialFailureScreen({
  errorMessage = "gmail blinked",
  reason,
  onRetry,
  onSkip,
  isLoading = false,
}: PartialFailureScreenProps) {
  return (
    <div
      className={css((t) => ({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: t.spacing(4),
        background: "transparent",
        textAlign: "center",
      }))}
    >
      {/* Coral jelly with ! */}
      <div
        className={css((t) => ({
          width: "100px",
          height: "100px",
          borderRadius: "18px",
          background: "linear-gradient(135deg, rgba(255, 140, 130, 0.75), rgba(255, 160, 150, 0.85))",
          boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(120, 50, 40, 0.15), 0 20px 52px -12px rgba(255, 79, 138, 0.3)",
          border: "1px solid rgba(255, 180, 170, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "52px",
          fontWeight: "700",
          color: "white",
          marginBottom: t.spacing(6),
        }))}>
        !
      </div>

      {/* Error title */}
      <h1
        className={css((t) => ({
          fontSize: "44px",
          fontFamily: '"Instrument Serif", serif',
          fontWeight: "400",
          margin: 0,
          color: "#2A0E1A",
          marginBottom: t.spacing(2),
          lineHeight: "1.2",
        }))}
      >
        {errorMessage}
      </h1>

      {/* Reason card */}
      {reason && (
        <div
          className={css((t) => ({
            borderRadius: "16px",
            background: "rgba(255, 255, 255, 0.32)",
            backdropFilter: "blur(14px) saturate(1.4)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
            padding: t.spacing(3),
            margin: `${t.spacing(6)} 0`,
            maxWidth: "400px",
            fontSize: t.fontSize.sm,
            color: "#A87B95",
            lineHeight: t.lineHeight.relaxed,
          }))}
        >
          {reason}
        </div>
      )}

      {/* Action buttons */}
      <div
        className={css((t) => ({
          display: "flex",
          gap: t.spacing(2),
          marginTop: t.spacing(4),
          justifyContent: "center",
          flexWrap: "wrap",
        }))}
      >
        {onSkip && (
          <button
            onClick={onSkip}
            disabled={isLoading}
            className={css((t) => ({
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#2A0E1A",
              borderRadius: "8px",
              padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
              fontSize: t.fontSize.base,
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.15s",
              "&:hover:not(:disabled)": {
                background: "rgba(255, 255, 255, 0.25)",
                borderColor: "rgba(255, 255, 255, 0.5)",
              },
              "&:active:not(:disabled)": {
                transform: "scale(0.96)",
              },
              "&:disabled": {
                opacity: 0.5,
                cursor: "not-allowed",
              },
            }))}
          >
            skip
          </button>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isLoading}
            className={css((t) => ({
              background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
              border: "none",
              color: "white",
              borderRadius: "8px",
              padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
              fontSize: t.fontSize.base,
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 4px 12px rgba(255, 79, 138, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
              "&:hover:not(:disabled)": {
                boxShadow: "0 6px 16px rgba(255, 79, 138, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
              },
              "&:active:not(:disabled)": {
                transform: "scale(0.96)",
              },
              "&:disabled": {
                opacity: 0.5,
                cursor: "not-allowed",
              },
            }))}
          >
            {isLoading ? "retrying…" : "retry"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============ AI TYPING INDICATOR ============ */

export interface AITypingIndicatorProps {
  assistantName?: string;
}

export function AITypingIndicator({ assistantName = "Mailania" }: AITypingIndicatorProps) {
  return (
    <div
      className={css((t) => ({
        display: "flex",
        alignItems: "flex-end",
        flexDirection: "row",
        marginBottom: t.spacing(2),
      }))}
    >
      <div
        className={css((t) => ({
          maxWidth: "72%",
          padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
          borderRadius: t.radiusBubble,
          fontSize: t.fontSize.sm,
          lineHeight: t.lineHeight.relaxed,
          background: "rgba(255, 255, 255, 0.55)",
          backdropFilter: "blur(24px) saturate(1.6)",
          border: "1px solid rgba(255, 255, 255, 0.85)",
          color: "#2A0E1A",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
          display: "flex",
          alignItems: "center",
          gap: t.spacing(1),
          "@media (max-width: 640px)": {
            maxWidth: "85%",
            padding: `${t.spacing(2.25)} ${t.spacing(2.5)}`,
          },
        }))}>
        {/* Three animated dots */}
        {[0, 1, 2].map((dotIndex) => (
          <div
            key={dotIndex}
            className={css((t) => ({
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#A87B95",
              animation: "bounce-dots 1.2s ease-in-out infinite",
            }))}
            style={{ animationDelay: `${dotIndex * 0.1}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ============ SUGGESTION APPROVE ANIMATION ============ */

/**
 * ApproveAnimation: When user taps ✓ on a suggestion card,
 * the card flashes the jelly color, then fades and slides up.
 * 
 * Usage: Wrap a suggestion card in this component and call
 * startAnimation() when approve button is clicked.
 */

export interface ApproveAnimationProps {
  children: React.ReactNode;
  onAnimationComplete?: () => void;
}

export function ApproveAnimation({ children, onAnimationComplete }: ApproveAnimationProps) {
  const [isAnimating, setIsAnimating] = React.useState(false);

  React.useEffect(() => {
    if (isAnimating) {
      const timer = setTimeout(() => {
        setIsAnimating(false);
        onAnimationComplete?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAnimating, onAnimationComplete]);

  return (
    <div
      className={css((t) => ({}))}
      style={{ animation: isAnimating ? "suggest-approve 300ms ease-out forwards" : "none" }}
    >
      {children}
    </div>
  );
}

export function startApproveAnimation(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.animation = "suggest-approve 300ms ease-out forwards";
}

/* ============ PAGE TRANSITION HELPER ============ */

/**
 * PageTransition: Simple 200ms opacity crossfade between screens
 */

export interface PageTransitionProps {
  children: React.ReactNode;
  isVisible: boolean;
}

export function PageTransition({ children, isVisible }: PageTransitionProps) {
  return (
    <div
      className={css((t) => ({
        transition: "opacity 200ms ease-in-out",
      }))}
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      {children}
    </div>
  );
}

/* ============ LAYOUT SHELLS ============ */

/**
 * TabletLayoutShell: 72px icon rail + center content + 380px right pane
 * Responsive: Shows full layout on tablet (641-1024px) and desktop (>1024px)
 */

export interface TabletLayoutShellProps {
  navIcons?: React.ReactNode; // Icon buttons for rail
  centerContent?: React.ReactNode;
  rightPane?: React.ReactNode;
  userAvatar?: React.ReactNode;
}

export function TabletLayoutShell({
  navIcons,
  centerContent,
  rightPane,
  userAvatar,
}: TabletLayoutShellProps) {
  return (
    <div
      className={css((t) => ({
        display: "none",
        height: "100vh",
        "@media (min-width: 641px) and (max-width: 1024px)": {
          display: "flex",
        },
        "@media (min-width: 1025px)": {
          display: "none",
        },
      }))}
    >
      {/* Icon rail */}
      <div
        className={css((t) => ({
          width: "72px",
          borderRight: "1px solid rgba(255, 255, 255, 0.2)",
          padding: t.spacing(2),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: t.spacing(3),
          overflow: "auto",
        }))}
      >
        {navIcons}
        <div style={{ flex: 1 }} />
        {userAvatar}
      </div>

      {/* Center content */}
      <div
        className={css((t) => ({
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255, 255, 255, 0.2)",
        }))}
      >
        {centerContent}
      </div>

      {/* Right pane (380px) */}
      <div
        className={css((t) => ({
          width: "380px",
          borderLeft: "1px solid rgba(255, 255, 255, 0.2)",
          overflow: "auto",
        }))}
      >
        {rightPane}
      </div>
    </div>
  );
}

/**
 * DesktopLayoutShell: 240px left nav sidebar + center + right pane
 */

export interface DesktopLayoutShellProps {
  sidebar?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightPane?: React.ReactNode;
}

export function DesktopLayoutShell({
  sidebar,
  centerContent,
  rightPane,
}: DesktopLayoutShellProps) {
  return (
    <div
      className={css((t) => ({
        display: "none",
        height: "100vh",
        "@media (min-width: 1025px)": {
          display: "flex",
        },
      }))}
    >
      {/* Left sidebar (240px) */}
      <div
        className={css((t) => ({
          width: "240px",
          borderRight: "1px solid rgba(255, 255, 255, 0.2)",
          padding: t.spacing(4),
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }))}
      >
        {sidebar}
      </div>

      {/* Center content */}
      <div
        className={css((t) => ({
          flex: 1,
          minWidth: 0,
          maxWidth: "720px",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255, 255, 255, 0.2)",
        }))}
      >
        {centerContent}
      </div>

      {/* Right pane (380px) */}
      <div
        className={css((t) => ({
          width: "380px",
          overflow: "auto",
        }))}
      >
        {rightPane}
      </div>
    </div>
  );
}
