/**
 * DetailScreen — Shows detailed rule and email preview for a single suggestion
 * 
 * Form factors:
 * - Phone: Separate screen from pile
 * - Tablet/Desktop: Right pane in split view
 */

import { css } from "@flow-css/core/css";

export interface EmailPreview {
  id: string;
  from: string;
  subject: string;
  preview: string;
  isArchived?: boolean;
}

export interface DetailScreenProps {
  ruleTitle: string;
  ruleDescription?: string;
  emailPreviews: EmailPreview[];
  isLoading?: boolean;
  onApprove?: () => void;
  onDismiss?: () => void;
  onBack?: () => void;
  isMobileView?: boolean;
}

export function DetailScreen({
  ruleTitle,
  ruleDescription,
  emailPreviews,
  isLoading = false,
  onApprove,
  onDismiss,
  onBack,
  isMobileView = false,
}: DetailScreenProps) {
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
          zIndex: 50,
          background: "rgba(255, 255, 255, 0.32)",
          backdropFilter: "blur(14px) saturate(1.4)",
        },
      }))}
    >
      {/* Mobile header */}
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
              fontSize: t.fontSize.lg,
              fontWeight: "600",
              margin: 0,
              color: "#2A0E1A",
            }))}
          >
            Rule Details
          </h1>
        </div>
      )}

      {/* Scrollable content */}
      <div
        className={css((t) => ({
          flex: 1,
          overflowY: "auto",
          padding: t.spacing(3),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(3),
          "@media (max-width: 640px)": {
            padding: t.spacing(2),
            paddingBottom: t.spacing(6),
          },
        }))}
      >
        {/* Rule card */}
        <div
          className={css((t) => ({
            borderRadius: "16px",
            background: "rgba(255, 255, 255, 0.32)",
            backdropFilter: "blur(14px) saturate(1.4)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
            padding: t.spacing(3),
          }))}
        >
          <div
            className={css((t) => ({
              fontSize: t.fontSize.xs,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#A87B95",
              marginBottom: t.spacing(1.5),
            }))}
          >
            Rule
          </div>
          <h2
            className={css((t) => ({
              fontSize: "20px",
              fontFamily: '"Instrument Serif", serif',
              fontWeight: "400",
              margin: 0,
              color: "#2A0E1A",
              marginBottom: t.spacing(1.5),
              lineHeight: "1.3",
            }))}
          >
            {ruleTitle}
          </h2>
          {ruleDescription && (
            <p
              className={css((t) => ({
                fontSize: t.fontSize.sm,
                color: "#A87B95",
                margin: 0,
                lineHeight: t.lineHeight.relaxed,
              }))}
            >
              {ruleDescription}
            </p>
          )}
        </div>

        {/* Email preview list */}
        <div>
          <h3
            className={css((t) => ({
              fontSize: t.fontSize.sm,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#A87B95",
              margin: `0 0 ${t.spacing(2)} 0`,
            }))}
          >
            Affected Emails ({emailPreviews.length})
          </h3>

          {isLoading ? (
            <div
              className={css((t) => ({
                textAlign: "center",
                color: "#A87B95",
                fontSize: t.fontSize.sm,
                padding: t.spacing(4),
              }))}
            >
              Loading emails…
            </div>
          ) : emailPreviews.length === 0 ? (
            <div
              className={css((t) => ({
                textAlign: "center",
                color: "#A87B95",
                fontSize: t.fontSize.sm,
                padding: t.spacing(4),
              }))}
            >
              No emails to display
            </div>
          ) : (
            <div
              className={css((t) => ({
                display: "flex",
                flexDirection: "column",
                gap: t.spacing(2),
              }))}
            >
              {emailPreviews.map((email, idx) => (
                <EmailPreviewItem
                  key={email.id}
                  email={email}
                  isLast={idx === emailPreviews.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isMobileView && (
        <div
          className={css((t) => ({
            display: "flex",
            gap: t.spacing(2),
            padding: t.spacing(3),
            borderTop: "1px solid rgba(255, 255, 255, 0.3)",
            background: "transparent",
            flexShrink: 0,
          }))}
        >
          <button
            onClick={onDismiss}
            className={css((t) => ({
              flex: 1,
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#2A0E1A",
              borderRadius: "8px",
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              fontSize: t.fontSize.sm,
              fontWeight: "600",
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
            dismiss
          </button>
          <button
            onClick={onApprove}
            className={css((t) => ({
              flex: 1,
              background: "linear-gradient(135deg, #FF4F8A, #FF6FA0)",
              border: "none",
              color: "white",
              borderRadius: "8px",
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              fontSize: t.fontSize.sm,
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 4px 12px rgba(255, 79, 138, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
              "&:hover": {
                boxShadow: "0 6px 16px rgba(255, 79, 138, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
              },
              "&:active": {
                transform: "scale(0.96)",
              },
            }))}
          >
            approve
          </button>
        </div>
      )}
    </div>
  );
}

interface EmailPreviewItemProps {
  email: EmailPreview;
  isLast: boolean;
}

function EmailPreviewItem({ email, isLast }: EmailPreviewItemProps) {
  return (
    <div
      className={css((t) => ({
        borderRadius: "12px",
        background: "rgba(255, 255, 255, 0.15)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        padding: t.spacing(2.5),
        transition: "all 0.2s",
        "&:hover": {
          background: "rgba(255, 255, 255, 0.25)",
          borderColor: "rgba(255, 255, 255, 0.5)",
        },
      }))}
      style={{ opacity: email.isArchived ? 0.55 : 1 }}
    >
      <div
        className={css((t) => ({
          display: "flex",
          alignItems: "flex-start",
          gap: t.spacing(1.5),
          marginBottom: t.spacing(1),
        }))}
      >
        <div
          className={css((t) => ({
            fontSize: t.fontSize.xs,
            fontWeight: "600",
            color: "#2A0E1A",
            flex: 1,
            minWidth: 0,
          }))}
        >
          {email.from}
        </div>
        {email.isArchived && (
          <span
            className={css((t) => ({
              fontSize: t.fontSize.xs,
              background: "rgba(140, 220, 180, 0.3)",
              color: "#2A0E1A",
              padding: `${t.spacing(0.5)} ${t.spacing(1)}`,
              borderRadius: "4px",
              flexShrink: 0,
            }))}
          >
            archived
          </span>
        )}
      </div>
      <p
        className={css((t) => ({
          fontSize: t.fontSize.sm,
          color: "#2A0E1A",
          margin: `0 0 ${t.spacing(1)} 0`,
          lineHeight: "1.4",
          fontWeight: "500",
        }))}
      >
        {email.subject}
      </p>
      <p
        className={css((t) => ({
          fontSize: t.fontSize.xs,
          color: "#A87B95",
          margin: 0,
          lineHeight: "1.4",
        }))}
      >
        {email.preview}
      </p>
    </div>
  );
}
