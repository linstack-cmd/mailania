/**
 * Settings Screen (Glassy redesign)
 * 
 * Shows three main settings as glass cards with jelly icons:
 * 1. Connected: mint ✓ with Gmail account info
 * 2. Preferences: butter ✎ to edit rules
 * 3. Disconnect: coral ✕ to unlink Gmail
 */

import { css } from "@flow-css/core/css";

export interface SettingsScreenProps {
  userEmail?: string;
  gmailConnected?: boolean;
  onEditPreferences?: () => void;
  onDisconnect?: () => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function SettingsScreen({
  userEmail,
  gmailConnected = false,
  onEditPreferences,
  onDisconnect,
  onBack,
  isLoading = false,
}: SettingsScreenProps) {
  return (
    <div
      className={css((t) => ({
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        padding: t.spacing(4),
        background: "transparent",
      }))}
    >
      {/* Header */}
      <div
        className={css((t) => ({
          display: "flex",
          alignItems: "center",
          gap: t.spacing(2),
          marginBottom: t.spacing(6),
        }))}
      >
        {onBack && (
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
        )}
        <h1
          className={css((t) => ({
            fontSize: t.fontSize.xl,
            fontWeight: "600",
            margin: 0,
            color: "#2A0E1A",
          }))}
        >
          settings
        </h1>
      </div>

      {/* Settings rows */}
      <div
        className={css((t) => ({
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(2),
          maxWidth: "600px",
        }))}
      >
        {/* Connected - Mint */}
        <SettingRow
          jellyIcon="✓"
          jellyColor="mint"
          label="Gmail Account"
          description={
            gmailConnected
              ? userEmail || "Connected"
              : "Not connected"
          }
          onAction={() => {}} // Read-only in current version
          actionLabel={gmailConnected ? "connected" : "connect"}
          disabled={isLoading}
        />

        {/* Preferences - Butter */}
        <SettingRow
          jellyIcon="✎"
          jellyColor="butter"
          label="Preferences"
          description="Manage rules and behavior"
          onAction={onEditPreferences}
          actionLabel="edit"
          disabled={isLoading || !gmailConnected}
        />

        {/* Disconnect - Coral */}
        <SettingRow
          jellyIcon="✕"
          jellyColor="coral"
          label="Disconnect Gmail"
          description="Remove access and clear data"
          onAction={onDisconnect}
          actionLabel="disconnect"
          isDangerous
          disabled={isLoading || !gmailConnected}
        />
      </div>
    </div>
  );
}

interface SettingRowProps {
  jellyIcon: string;
  jellyColor: "mint" | "butter" | "coral" | "lilac";
  label: string;
  description: string;
  onAction: () => void;
  actionLabel: string;
  isDangerous?: boolean;
  disabled?: boolean;
}

function SettingRow({
  jellyIcon,
  jellyColor,
  label,
  description,
  onAction,
  actionLabel,
  isDangerous = false,
  disabled = false,
}: SettingRowProps) {
  const colorMap = {
    mint: "linear-gradient(135deg, rgba(140, 220, 180, 0.75), rgba(160, 235, 195, 0.85))",
    butter: "linear-gradient(135deg, rgba(255, 200, 100, 0.75), rgba(255, 220, 130, 0.85))",
    coral: "linear-gradient(135deg, rgba(255, 140, 130, 0.75), rgba(255, 160, 150, 0.85))",
    lilac: "linear-gradient(135deg, rgba(200, 150, 220, 0.75), rgba(220, 170, 240, 0.85))",
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
        display: "flex",
        alignItems: "center",
        gap: t.spacing(3),
        transition: "all 0.3s ease",
        cursor: "pointer",
        "&:hover": {
          background: "rgba(255, 255, 255, 0.42)",
          transform: "translateY(-2px)",
          borderColor: "rgba(255, 255, 255, 0.75)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -8px rgba(255, 79, 138, 0.35)",
        },
      }))}
      style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onClick={!disabled ? onAction : undefined}
      onKeyDown={
        !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAction();
              }
            }
          : undefined
      }
    >
      {/* Jelly tile */}
      <div
        className={css((t) => ({
          width: "48px",
          height: "48px",
          minWidth: "48px",
          borderRadius: "12px",
          boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 6px rgba(0, 0, 0, 0.1), 0 12px 32px -12px rgba(255, 79, 138, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
          fontWeight: "700",
          color: "white",
        }))}
        style={{ background: colorMap[jellyColor] }}
      >
        {jellyIcon}
      </div>

      {/* Label + Description */}
      <div
        className={css((t) => ({
          flex: 1,
          minWidth: 0,
        }))}
      >
        <h3
          className={css((t) => ({
            fontSize: t.fontSize.base,
            fontWeight: "600",
            margin: 0,
            color: "#2A0E1A",
            lineHeight: "1.2",
          }))}
        >
          {label}
        </h3>
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

      {/* Chevron / Action button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        disabled={disabled}
        className={css((t) => ({
          borderRadius: "8px",
          padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
          fontSize: t.fontSize.xs,
          fontWeight: "600",
          cursor: "pointer",
          flexShrink: 0,
          transition: "all 0.15s",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          color: "#2A0E1A",
          background: "rgba(255, 255, 255, 0.15)",
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
        style={isDangerous ? {
          background: "rgba(255, 140, 130, 0.2)",
          borderColor: "rgba(255, 140, 130, 0.4)",
          color: "rgba(255, 100, 90, 0.8)",
        } : undefined}
      >
        {actionLabel}
      </button>
    </div>
  );
}
