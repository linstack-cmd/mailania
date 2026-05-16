/**
 * Onboarding flow screens for Mailania Glassy
 * 
 * Flow:
 * 1. Welcome (unauthenticated)
 * 2. Connect Gmail (step 1 of 2)
 * 3. Preferences (step 2 of 2)
 */

import React from "react";
import { css } from "@flow-css/core/css";

/* ============ WELCOME SCREEN ============ */

export interface WelcomeScreenProps {
  onGetStarted: () => void;
  isLoading?: boolean;
}

export function WelcomeScreen({ onGetStarted, isLoading = false }: WelcomeScreenProps) {
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
      {/* Jelly chip — pink */}
      <div
        className={css((t) => ({
          width: "80px",
          height: "80px",
          borderRadius: "16px",
          background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
          boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(120, 30, 80, 0.2), 0 16px 48px -12px rgba(255, 79, 138, 0.4)",
          border: "1px solid rgba(255, 200, 220, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "40px",
          marginBottom: t.spacing(6),
        }))}>
        m
      </div>

      {/* Title with italic "mailania" */}
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
        }))}
      >
        hi, i'm <em style={{ fontStyle: "italic" }}>mailania</em>
      </h1>

      {/* Subtitle */}
      <p
        className={css((t) => ({
          fontSize: t.fontSize.lg,
          color: "#A87B95",
          margin: `0 0 ${t.spacing(8)} 0`,
          maxWidth: "500px",
          lineHeight: t.lineHeight.relaxed,
        }))}
      >
        your inbox assistant. let's set you up.
      </p>

      {/* Preview cards (3 jelly colors) */}
      <div
        className={css((t) => ({
          display: "flex",
          gap: t.spacing(3),
          marginBottom: t.spacing(8),
          justifyContent: "center",
          flexWrap: "wrap",
          maxWidth: "600px",
        }))}
      >
        <PreviewCard
          color="mint"
          title="archive"
          description="auto-move emails"
        />
        <PreviewCard
          color="butter"
          title="filter"
          description="smart labels"
        />
        <PreviewCard
          color="coral"
          title="reply"
          description="handle drafts"
        />
      </div>

      {/* Get started button */}
      <button
        onClick={onGetStarted}
        disabled={isLoading}
        className={css((t) => ({
          background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
          border: "none",
          color: "white",
          borderRadius: "8px",
          padding: `${t.spacing(3)} ${t.spacing(5)}`,
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
        get started
      </button>
    </div>
  );
}

interface PreviewCardProps {
  color: "mint" | "butter" | "coral";
  title: string;
  description: string;
}

function PreviewCard({ color, title, description }: PreviewCardProps) {
  const bgMap = {
    mint: "linear-gradient(135deg, rgba(140, 220, 180, 0.75), rgba(160, 235, 195, 0.85))",
    butter: "linear-gradient(135deg, rgba(255, 200, 100, 0.75), rgba(255, 220, 130, 0.85))",
    coral: "linear-gradient(135deg, rgba(255, 140, 130, 0.75), rgba(255, 160, 150, 0.85))",
  };

  return (
    <div
      className={css((t) => ({
        width: "140px",
        borderRadius: "12px",
        background: "rgba(255, 255, 255, 0.15)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        padding: t.spacing(3),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: t.spacing(1.5),
      }))}
    >
      <div
        className={css((t) => ({
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(0, 0, 0, 0.1), 0 8px 16px -4px rgba(255, 79, 138, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
        }))}
        style={{ background: bgMap[color] }}
      />
      <div>
        <p
          className={css((t) => ({
            fontSize: t.fontSize.sm,
            fontWeight: "600",
            color: "#2A0E1A",
            margin: 0,
          }))}
        >
          {title}
        </p>
        <p
          className={css((t) => ({
            fontSize: t.fontSize.xs,
            color: "#A87B95",
            margin: `${t.spacing(0.5)} 0 0`,
          }))}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

/* ============ CONNECT GMAIL SCREEN ============ */

export interface ConnectGmailScreenProps {
  onConnect: () => void;
  isLoading?: boolean;
  error?: string;
}

export function ConnectGmailScreen({ onConnect, isLoading = false, error }: ConnectGmailScreenProps) {
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
      }))}
    >
      <div
        className={css((t) => ({
          maxWidth: "500px",
          width: "100%",
        }))}
      >
        {/* Step indicator */}
        <div
          className={css((t) => ({
            fontSize: t.fontSize.xs,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#A87B95",
            marginBottom: t.spacing(4),
            textAlign: "center",
          }))}
        >
          step 1 of 2
        </div>

        {/* Title */}
        <h1
          className={css((t) => ({
            fontSize: "36px",
            fontFamily: '"Instrument Serif", serif',
            fontWeight: "400",
            margin: 0,
            color: "#2A0E1A",
            marginBottom: t.spacing(3),
            lineHeight: "1.2",
          }))}
        >
          connect gmail
        </h1>

        {/* Card with permissions */}
        <div
          className={css((t) => ({
            borderRadius: "16px",
            background: "rgba(255, 255, 255, 0.32)",
            backdropFilter: "blur(14px) saturate(1.4)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
            padding: t.spacing(4),
            marginBottom: t.spacing(4),
          }))}
        >
          <p
            className={css((t) => ({
              fontSize: t.fontSize.sm,
              color: "#A87B95",
              margin: `0 0 ${t.spacing(3)} 0`,
              lineHeight: t.lineHeight.relaxed,
            }))}
          >
            Mailania needs these permissions to help manage your inbox:
          </p>

          {/* Permission items */}
          <div className={css((t) => ({}))}>
            {[
              "read your emails",
              "apply labels and organize",
              "analyze message content",
              "send API requests",
            ].map((perm, idx, arr) => (
              <div key={idx}>
                <div
                  className={css((t) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: t.spacing(2),
                    padding: t.spacing(2),
                    fontSize: t.fontSize.sm,
                    color: "#2A0E1A",
                  }))}
                >
                  <span style={{ color: "#FF4F8A" }}>✓</span>
                  <span>{perm}</span>
                </div>
                {idx < arr.length - 1 && (
                  <div
                    className={css((t) => ({
                      height: "1px",
                      background: "rgba(255, 255, 255, 0.2)",
                      borderStyle: "dashed",
                      margin: 0,
                    }))}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div
            className={css((t) => ({
              background: "rgba(255, 130, 165, 0.2)",
              border: "1px solid rgba(255, 130, 165, 0.4)",
              color: "#2A0E1A",
              borderRadius: "8px",
              padding: t.spacing(2),
              marginBottom: t.spacing(3),
              fontSize: t.fontSize.sm,
            }))}
          >
            {error}
          </div>
        )}

        {/* Connect button */}
        <button
          onClick={onConnect}
          disabled={isLoading}
          className={css((t) => ({
            width: "100%",
            background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
            border: "none",
            color: "white",
            borderRadius: "8px",
            padding: `${t.spacing(3)} ${t.spacing(4)}`,
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
          {isLoading ? "connecting…" : "connect gmail"}
        </button>
      </div>
    </div>
  );
}

/* ============ PREFERENCES SCREEN ============ */

export interface PreferencesScreenProps {
  initialRules?: string;
  onSave: (rules: string) => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

export function PreferencesScreen({
  initialRules = "",
  onSave,
  onSkip,
  isLoading = false,
}: PreferencesScreenProps) {
  const [rules, setRules] = React.useState(initialRules);
  const [selectedChip, setSelectedChip] = React.useState<string | null>(null);

  const handleChipClick = (suggestion: string) => {
    setRules((prev) => (prev ? prev + "\n" : "") + suggestion);
    setSelectedChip(suggestion);
    setTimeout(() => setSelectedChip(null), 300);
  };

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
      }))}
    >
      <div
        className={css((t) => ({
          maxWidth: "600px",
          width: "100%",
        }))}
      >
        {/* Step indicator */}
        <div
          className={css((t) => ({
            fontSize: t.fontSize.xs,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#A87B95",
            marginBottom: t.spacing(4),
            textAlign: "center",
          }))}
        >
          step 2 of 2
        </div>

        {/* Title */}
        <h1
          className={css((t) => ({
            fontSize: "36px",
            fontFamily: '"Instrument Serif", serif',
            fontWeight: "400",
            margin: 0,
            color: "#2A0E1A",
            marginBottom: t.spacing(3),
            lineHeight: "1.2",
          }))}
        >
          your preferences
        </h1>

        {/* Rules editor card */}
        <div
          className={css((t) => ({
            borderRadius: "16px",
            background: "rgba(255, 255, 255, 0.32)",
            backdropFilter: "blur(14px) saturate(1.4)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
            padding: t.spacing(4),
            marginBottom: t.spacing(4),
          }))}
        >
          <label
            className={css((t) => ({
              fontSize: t.fontSize.xs,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#A87B95",
              display: "block",
              marginBottom: t.spacing(2),
            }))}
          >
            Rules (plaintext)
          </label>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="describe how mailania should organize your inbox"
            className={css((t) => ({
              width: "100%",
              minHeight: "200px",
              padding: t.spacing(2),
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              background: "rgba(255, 255, 255, 0.1)",
              color: "#2A0E1A",
              fontSize: t.fontSize.sm,
              fontFamily: "monospace",
              transition: "border-color 0.15s",
              boxSizing: "border-box",
              "&:focus": {
                outline: "none",
                borderColor: "#FF4F8A",
              },
              "&::placeholder": {
                color: "#A87B95",
              },
            }))}
          />
        </div>

        {/* Suggestion chips */}
        <div
          className={css((t) => ({
            display: "flex",
            gap: t.spacing(2),
            flexWrap: "wrap",
            marginBottom: t.spacing(4),
            justifyContent: "center",
          }))}
        >
          {[
            "+ github rule",
            "+ reply tone",
            "+ allowlist",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleChipClick(suggestion)}
              className={css((t) => ({
                background: "rgba(255, 255, 255, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                color: "#2A0E1A",
                borderRadius: "999px",
                padding: `${t.spacing(1.5)} ${t.spacing(2.5)}`,
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
              }))}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div
          className={css((t) => ({
            display: "flex",
            gap: t.spacing(2),
          }))}
        >
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={isLoading}
              className={css((t) => ({
                flex: 1,
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                color: "#2A0E1A",
                borderRadius: "8px",
                padding: `${t.spacing(3)} ${t.spacing(4)}`,
                fontSize: t.fontSize.base,
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s",
                "&:hover:not(:disabled)": {
                  background: "rgba(255, 255, 255, 0.1)",
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
          <button
            onClick={() => onSave(rules)}
            disabled={isLoading}
            className={css((t) => ({
              flex: 1,
              background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
              border: "none",
              color: "white",
              borderRadius: "8px",
              padding: `${t.spacing(3)} ${t.spacing(4)}`,
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
            {isLoading ? "saving…" : "looks good"}
          </button>
        </div>
      </div>
    </div>
  );
}
