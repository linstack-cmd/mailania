/**
 * DesktopLayout — Three-column desktop layout (Glassy design)
 * 
 * Structure:
 * - Left sidebar (240px): logo wordmark, nav items with labels, user info at bottom
 * - Chat center (flex 1, max-width 720px)
 * - Right pane (380px): TodayCard + suggestions peek
 */

import { useLocation } from "wouter";
import { css } from "@flow-css/core/css";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";
import ProposalSidebar from "./ProposalSidebar";
import { TodayCard } from "./TodayCard";
import { PileScreen, type Suggestion } from "./PileScreen";
import { DetailScreen } from "./DetailScreen";
import type { TriageSuggestion } from "./TriageSuggestions";

// Helper to compute kind summary from suggestions
function computeKindSummary(suggestionsWithIds: Array<{id: string, suggestion: any, status: string}>): string {
  if (suggestionsWithIds.length === 0) return "";
  
  const kindMap: Record<string, string> = {
    archive_bulk: "archive",
    create_filter: "filter",
    needs_user_input: "reply",
    mark_read_bulk: "digest",
  };
  
  const uniqueKinds = new Set<string>();
  for (const { suggestion } of suggestionsWithIds) {
    const kind = suggestion?.kind;
    const label = kindMap[kind];
    if (label) {
      uniqueKinds.add(label);
    }
  }
  
  const kindsList = Array.from(uniqueKinds);
  return kindsList.length > 0 ? kindsList.join(" · ") : "";
}

interface DesktopLayoutProps {
  // Chat
  messages: ChatMessageData[];
  loading: boolean;
  initLoading: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  mentionSuggestions: Array<{id: string, title: string, kind: string}>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;

  // Suggestions
  suggestionsWithIds: Array<{id: string, suggestion: TriageSuggestion, status: string}>;
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  onDismissSuggestion: (id: string) => Promise<void>;
  onAcceptSuggestion: (id: string) => void;
  onMentionSuggestion: (s: { id: string; title: string }) => void;
  onSuggestionNotification: (title: string, status: "accepted" | "dismissed") => void;

  // Status
  status?: any;
  testMode?: boolean;

  // Pagination
  hasMore?: boolean;
  paginationLoading?: boolean;
  onLoadMore?: (beforeId: string) => void;

  // Handlers
  onLogout: () => void;
  onNavigate: (path: string) => void;

  // Today Card
  userName?: string;
}

export function DesktopLayout({
  messages,
  loading,
  initLoading,
  error,
  input,
  onInputChange,
  onSend,
  mentionSuggestions,
  textareaRef,
  suggestionsWithIds,
  suggestionsLoading,
  suggestionsError,
  onDismissSuggestion,
  onAcceptSuggestion,
  onMentionSuggestion,
  onSuggestionNotification,
  status,
  testMode = false,
  hasMore = true,
  paginationLoading = false,
  onLoadMore,
  onLogout,
  onNavigate,
  userName,
}: DesktopLayoutProps) {
  const [, setLocation] = useLocation();

  return (
    <div
      className={css((t) => ({
        display: "flex",
        width: "100%",
        height: "100dvh",
        background: "transparent",
        overflow: "hidden",
      }))}
    >
      {/* Left Sidebar (240px) */}
      <div
        className={css((t) => ({
          width: "240px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "rgba(255, 255, 255, 0.32)",
          backdropFilter: "blur(14px) saturate(1.4)",
          borderRight: "1px solid rgba(255, 255, 255, 0.6)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
          padding: `${t.spacing(6)} ${t.spacing(4)}`,
          gap: t.spacing(8),
          boxSizing: "border-box",
        }))}
      >
        {/* Logo */}
        <div
          className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(2),
          }))}
        >
          <div
            className={css((t) => ({
              width: "40px",
              height: "40px",
              background: t.gradients.logo,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: "700",
              color: "white",
              boxShadow: "0 4px 12px rgba(255, 79, 138, 0.2)",
              flexShrink: 0,
            }))}
          >
            ✨
          </div>
          <h1
            className={css((t) => ({
              fontSize: "16px",
              fontWeight: "700",
              margin: 0,
              color: "#2A0E1A",
              fontFamily: '"Instrument Serif", serif',
            }))}
          >
            mailania
          </h1>
        </div>

        {/* Nav items */}
        <nav
          className={css((t) => ({
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(2),
            flex: 1,
          }))}
        >
          <button
            onClick={() => setLocation("/")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Chat</span>
          </button>

          <button
            onClick={() => setLocation("/pile")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Pile</span>
          </button>

          <button
            onClick={() => setLocation("/preferences")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><circle cx="12" cy="12" r="1"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m2.12 2.12l4.24 4.24M1 12h6m6 0h6m-15.78 7.78l4.24-4.24m2.12-2.12l4.24-4.24"/></svg>
            <span>Preferences</span>
          </button>

          <button
            onClick={() => setLocation("/settings")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <span>Settings</span>
          </button>
        </nav>

        {/* User info & logout at bottom */}
        <div
          className={css((t) => ({
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(2),
            paddingTop: t.spacing(4),
            borderTop: "1px solid rgba(255, 255, 255, 0.4)",
          }))}
        >
          <div
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(2),
            }))}
          >
            <div
              className={css((t) => ({
                width: "32px",
                height: "32px",
                background: t.gradients.avatarUser,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                color: "white",
                fontWeight: "600",
                flexShrink: 0,
              }))}
            >
              {status?.user?.displayName?.charAt(0).toUpperCase() || "A"}
            </div>
            <div
              className={css((t) => ({
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                minWidth: 0,
              }))}
            >
              <div
                className={css((t) => ({
                  fontSize: t.fontSize.xs,
                  fontWeight: "600",
                  color: "#2A0E1A",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }))}
              >
                {status?.user?.displayName || "User"}
              </div>
              <div
                className={css((t) => ({
                  fontSize: t.fontSize.xs,
                  color: "#6B3450",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }))}
              >
                {status?.user?.email}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "16px",
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
              fontSize: t.fontSize.xs,
              color: "#2A0E1A",
              fontWeight: "600",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.25)",
                borderColor: "rgba(255, 255, 255, 0.5)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Center: Chat area */}
      <div
        className={css((t) => ({
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          maxWidth: "720px",
          margin: "0 8px",
          width: "100%",
        }))}
      >
        <ChatPanel
          title="Chat with Mailania"
          subtitle="Read-only and recommendation-only — it can inspect mail and saved preferences, but it won't change your mailbox from chat."
          messages={messages}
          loading={loading}
          initLoading={initLoading}
          error={error}
          input={input}
          onInputChange={onInputChange}
          onSend={onSend}
          placeholder="Ask about your inbox…"
          emptyState="No messages yet. Start with a broad inbox question or ask Mailania to find a specific email."
          starterPrompts={[
            "What stands out in my inbox right now?",
            "Search for receipts from this month",
            "What triage preferences do you remember?",
            "Summarize the latest triage suggestions",
          ]}
          mentionSuggestions={mentionSuggestions}
          textareaRef={textareaRef}
          suppressHeader={true}
          hasMore={hasMore}
          paginationLoading={paginationLoading}
          onLoadMore={onLoadMore}
        />
      </div>

      {/* Right pane (380px) */}
      <div
        className={css((t) => ({
          width: "380px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(3),
          padding: `${t.spacing(6)} ${t.spacing(3)}`,
          overflow: "auto",
          boxSizing: "border-box",
        }))}
      >
        {/* Today Card */}
        <TodayCard
          pileCount={suggestionsWithIds.length}
          userName={userName}
          kindSummary={computeKindSummary(suggestionsWithIds)}
          lastTriageMessages={undefined}
          lastTriageSuggestions={undefined}
          onViewPile={() => setLocation("/pile")}
        />

        {/* Suggestions peek */}
        <ProposalSidebar
          suggestionsWithIds={suggestionsWithIds}
          suggestionsLoading={suggestionsLoading}
          suggestionsError={suggestionsError}
          onDismissSuggestion={onDismissSuggestion}
          onAcceptSuggestion={onAcceptSuggestion}
          onMentionSuggestion={onMentionSuggestion}
          onSuggestionNotification={onSuggestionNotification}
        />
      </div>
    </div>
  );
}

/**
 * DesktopLayoutWithPile — Wrapper that renders either Chat or Pile/Detail screens
 * inside the DesktopLayout's center column
 */
interface DesktopLayoutWithPileProps extends DesktopLayoutProps {
  layout?: "chat" | "pile" | "detail";
  pileScreenProps?: {
    suggestions: Suggestion[];
    isLoading: boolean;
    onApproveSuggestion: (id: string) => void;
    onViewDetail: (id: string) => void;
    onBack: () => void;
  };
  detailScreenProps?: {
    ruleTitle: string;
    ruleDescription?: string;
    emailPreviews: any[];
    isLoading: boolean;
    onApprove: () => void;
    onDismiss: () => void;
    onBack: () => void;
  };
}

export function DesktopLayoutWithPile({
  layout = "chat",
  pileScreenProps,
  detailScreenProps,
  ...desktopLayoutProps
}: DesktopLayoutWithPileProps) {
  const [, setLocation] = useLocation();

  return (
    <div
      className={css((t) => ({
        display: "flex",
        width: "100%",
        height: "100dvh",
        background: "transparent",
        overflow: "hidden",
      }))}
    >
      {/* Left Sidebar (240px) */}
      <div
        className={css((t) => ({
          width: "240px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "rgba(255, 255, 255, 0.32)",
          backdropFilter: "blur(14px) saturate(1.4)",
          borderRight: "1px solid rgba(255, 255, 255, 0.6)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
          padding: `${t.spacing(6)} ${t.spacing(4)}`,
          gap: t.spacing(8),
          boxSizing: "border-box",
        }))}
      >
        {/* Logo */}
        <div
          className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(2),
          }))}
        >
          <div
            className={css((t) => ({
              width: "40px",
              height: "40px",
              background: t.gradients.logo,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: "700",
              color: "white",
              boxShadow: "0 4px 12px rgba(255, 79, 138, 0.2)",
              flexShrink: 0,
            }))}
          >
            ✨
          </div>
          <h1
            className={css((t) => ({
              fontSize: "16px",
              fontWeight: "700",
              margin: 0,
              color: "#2A0E1A",
              fontFamily: '"Instrument Serif", serif',
            }))}
          >
            mailania
          </h1>
        </div>

        {/* Nav items */}
        <nav
          className={css((t) => ({
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(2),
            flex: 1,
          }))}
        >
          <button
            onClick={() => setLocation("/")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Chat</span>
          </button>

          <button
            onClick={() => setLocation("/pile")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Pile</span>
          </button>

          <button
            onClick={() => setLocation("/preferences")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><circle cx="12" cy="12" r="1"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m2.12 2.12l4.24 4.24M1 12h6m6 0h6m-15.78 7.78l4.24-4.24m2.12-2.12l4.24-4.24"/></svg>
            <span>Preferences</span>
          </button>

          <button
            onClick={() => setLocation("/settings")}
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(3),
              padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "transparent",
              color: "#2A0E1A",
              cursor: "pointer",
              fontSize: t.fontSize.sm,
              fontWeight: "500",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.3)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <span>Settings</span>
          </button>
        </nav>

        {/* User info & logout at bottom */}
        <div
          className={css((t) => ({
            display: "flex",
            flexDirection: "column",
            gap: t.spacing(2),
            paddingTop: t.spacing(4),
            borderTop: "1px solid rgba(255, 255, 255, 0.4)",
          }))}
        >
          <div
            className={css((t) => ({
              display: "flex",
              alignItems: "center",
              gap: t.spacing(2),
            }))}
          >
            <div
              className={css((t) => ({
                width: "32px",
                height: "32px",
                background: t.gradients.avatarUser,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                color: "white",
                fontWeight: "600",
                flexShrink: 0,
              }))}
            >
              {desktopLayoutProps.status?.user?.displayName?.charAt(0).toUpperCase() || "A"}
            </div>
            <div
              className={css((t) => ({
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                minWidth: 0,
              }))}
            >
              <div
                className={css((t) => ({
                  fontSize: t.fontSize.xs,
                  fontWeight: "600",
                  color: "#2A0E1A",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }))}
              >
                {desktopLayoutProps.status?.user?.displayName || "User"}
              </div>
              <div
                className={css((t) => ({
                  fontSize: t.fontSize.xs,
                  color: "#6B3450",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }))}
              >
                {desktopLayoutProps.status?.user?.email}
              </div>
            </div>
          </div>

          <button
            onClick={desktopLayoutProps.onLogout}
            className={css((t) => ({
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "16px",
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
              fontSize: t.fontSize.xs,
              color: "#2A0E1A",
              fontWeight: "600",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.25)",
                borderColor: "rgba(255, 255, 255, 0.5)",
              },
              "&:focus-visible": {
                outline: "2px solid #FF4F8A",
                outlineOffset: "2px",
              },
            }))}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Center: Content area (chat or pile/detail) */}
      <div
        className={css((t) => ({
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          maxWidth: "720px",
          margin: "0 8px",
          width: "100%",
        }))}
      >
        {layout === "chat" && (
          <ChatPanel
            title="Chat with Mailania"
            subtitle="Read-only and recommendation-only — it can inspect mail and saved preferences, but it won't change your mailbox from chat."
            messages={desktopLayoutProps.messages}
            loading={desktopLayoutProps.loading}
            initLoading={desktopLayoutProps.initLoading}
            error={desktopLayoutProps.error}
            input={desktopLayoutProps.input}
            onInputChange={desktopLayoutProps.onInputChange}
            onSend={desktopLayoutProps.onSend}
            placeholder="Ask about your inbox…"
            emptyState="No messages yet. Start with a broad inbox question or ask Mailania to find a specific email."
            starterPrompts={[
              "What stands out in my inbox right now?",
              "Search for receipts from this month",
              "What triage preferences do you remember?",
              "Summarize the latest triage suggestions",
            ]}
            mentionSuggestions={desktopLayoutProps.mentionSuggestions}
            textareaRef={desktopLayoutProps.textareaRef}
            suppressHeader={true}
            hasMore={desktopLayoutProps.hasMore}
            paginationLoading={desktopLayoutProps.paginationLoading}
            onLoadMore={desktopLayoutProps.onLoadMore}
          />
        )}
        {layout === "pile" && pileScreenProps && (
          <PileScreen
            suggestions={pileScreenProps.suggestions}
            isLoading={pileScreenProps.isLoading}
            onApproveSuggestion={pileScreenProps.onApproveSuggestion}
            onViewDetail={pileScreenProps.onViewDetail}
            onBack={pileScreenProps.onBack}
            isMobileView={false}
          />
        )}
        {layout === "detail" && detailScreenProps && (
          <DetailScreen
            ruleTitle={detailScreenProps.ruleTitle}
            ruleDescription={detailScreenProps.ruleDescription}
            emailPreviews={detailScreenProps.emailPreviews}
            isLoading={detailScreenProps.isLoading}
            onApprove={detailScreenProps.onApprove}
            onDismiss={detailScreenProps.onDismiss}
            onBack={detailScreenProps.onBack}
            isMobileView={false}
          />
        )}
      </div>

      {/* Right pane (380px) */}
      <div
        className={css((t) => ({
          width: "380px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(3),
          padding: `${t.spacing(6)} ${t.spacing(3)}`,
          overflow: "auto",
          boxSizing: "border-box",
        }))}
      >
        {/* Today Card */}
        <TodayCard
          pileCount={desktopLayoutProps.suggestionsWithIds.length}
          userName={desktopLayoutProps.userName}
          kindSummary={computeKindSummary(desktopLayoutProps.suggestionsWithIds)}
          lastTriageMessages={undefined}
          lastTriageSuggestions={undefined}
          onViewPile={() => setLocation("/pile")}
        />

        {/* Suggestions peek */}
        <ProposalSidebar
          suggestionsWithIds={desktopLayoutProps.suggestionsWithIds}
          suggestionsLoading={desktopLayoutProps.suggestionsLoading}
          suggestionsError={desktopLayoutProps.suggestionsError}
          onDismissSuggestion={desktopLayoutProps.onDismissSuggestion}
          onAcceptSuggestion={desktopLayoutProps.onAcceptSuggestion}
          onMentionSuggestion={desktopLayoutProps.onMentionSuggestion}
          onSuggestionNotification={desktopLayoutProps.onSuggestionNotification}
        />
      </div>
    </div>
  );
}
