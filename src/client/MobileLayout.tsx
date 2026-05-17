/**
 * MobileLayout — Single-column chat-first mobile layout (Glassy design)
 * 
 * Structure:
 * - Header/eyebrow (fixed at top)
 * - TodayCard (below header)
 * - Chat area (flex: 1, scrollable)
 * - Composer (fixed at bottom)
 * 
 * NO horizontal swipe panes. NO suggestions pane. Suggestions are accessed
 * via TodayCard navigation to /pile screen.
 */

import { useEffect, useRef, useState } from "react";
import { css } from "@flow-css/core/css";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";
import { ChatInputBar } from "./ChatInputBar";
import type { TriageSuggestion, InboxMessage } from "./TriageSuggestions";
import { KIND_LABELS } from "./TriageSuggestions";
import { updateMobileDebug } from "./mobileDebug";

interface MobileLayoutProps {
  messages: ChatMessageData[];
  loading: boolean;
  initLoading: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  mentionSuggestions: Array<{id: string, title: string, kind: string}>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  suggestionsWithIds: Array<{id: string, suggestion: TriageSuggestion, status: string}>;
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  inboxMessages?: InboxMessage[];
  status?: any;
  testMode?: boolean;
  hasMore?: boolean;
  paginationLoading?: boolean;
  onLoadMore?: (beforeId: string) => void;
  todayCardElement: React.ReactNode;
}

export function MobileLayout({
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
  inboxMessages = [],
  status,
  testMode = false,
  hasMore = true,
  paginationLoading = false,
  onLoadMore,
  todayCardElement,
}: MobileLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputBarWrapperRef = useRef<HTMLDivElement>(null);
  const [vpHeight, setVpHeight] = useState<number | undefined>(undefined);

  // Track visual viewport height for Firefox Android keyboard handling
  useEffect(() => {
    const update = () => {
      setVpHeight(window.visualViewport?.height ?? undefined);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  // Prevent body vertical scroll
  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  // Touch tracking for input bar vertical scroll prevention
  const inputBarTouchRef = useRef<{ startY: number } | null>(null);

  useEffect(() => {
    const handleInputBarTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      inputBarTouchRef.current = { startY: touch.clientY };
    };

    const handleInputBarTouchMove = (e: TouchEvent) => {
      if (!inputBarTouchRef.current) return;

      const touch = e.touches[0];
      const moveY = touch.clientY - inputBarTouchRef.current.startY;
      const absMoveY = Math.abs(moveY);

      if (absMoveY < 2) return;

      const targetElement = e.target as HTMLElement;
      const isTextarea = targetElement && targetElement.tagName === "TEXTAREA";

      if (isTextarea && textareaRef?.current) {
        const textarea = textareaRef.current;
        const hasInternalScroll = textarea.scrollHeight > textarea.clientHeight;

        if (hasInternalScroll) {
          const isSwipingDown = moveY > 0;
          const isSwipingUp = moveY < 0;
          const canScrollDown = textarea.scrollTop < textarea.scrollHeight - textarea.clientHeight;
          const canScrollUp = textarea.scrollTop > 0;

          if ((isSwipingDown && canScrollUp) || (isSwipingUp && canScrollDown)) {
            return;
          }
        }
      }

      e.preventDefault();
    };

    const handleInputBarTouchEnd = () => {
      inputBarTouchRef.current = null;
    };

    if (inputBarWrapperRef.current) {
      const inputBarWrapper = inputBarWrapperRef.current;
      inputBarWrapper.addEventListener("touchstart", handleInputBarTouchStart, false);
      inputBarWrapper.addEventListener("touchmove", handleInputBarTouchMove, { passive: false });
      inputBarWrapper.addEventListener("touchend", handleInputBarTouchEnd, false);

      return () => {
        inputBarWrapper.removeEventListener("touchstart", handleInputBarTouchStart);
        inputBarWrapper.removeEventListener("touchmove", handleInputBarTouchMove);
        inputBarWrapper.removeEventListener("touchend", handleInputBarTouchEnd);
      };
    }
  }, [textareaRef]);

  return (
    <div
      ref={containerRef}
      style={{
        height: vpHeight !== undefined ? `${vpHeight}px` : "100dvh",
      }}
      className={css((t) => ({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        background: "transparent",
        overflow: "hidden",
      }))}
    >

      {/* Test mode banner */}
      {testMode && (
        <div
          className={css((t) => ({
            padding: `${t.spacing(2)} ${t.spacing(4)}`,
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            borderBottom: "2px dashed #f59e0b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: t.spacing(2),
            fontSize: t.fontSize.xs,
            fontWeight: t.fontWeight.semibold,
            color: "#92400e",
            flexShrink: 0,
          }))}
        >
          <span style={{ fontSize: "1rem" }}>🧪</span>
          <span>Test Mode</span>
        </div>
      )}

      {/* Status bar zone (44px) — breathing room at top */}
      <div
        className={css((t) => ({
          height: "44px",
          flexShrink: 0,
        }))}
      />

      {/* Greeting chip + heading area */}
      <div
        className={css((t) => ({
          padding: `0 ${t.spacing(4)} ${t.spacing(3)}`,
          flexShrink: 0,
        }))}
      >
        {/* Greeting chip: "good morning, [name]" */}
        <div
          className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: t.spacing(3),
          }))}
        >
          <div
            className={css((t) => ({
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 255, 255, 0.75)",
              borderRadius: "999px",
              padding: "6px 12px",
              fontSize: "11px",
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: "600",
              color: "rgb(107, 52, 80)",
            }))}
          >
            good {getTimeOfDay()}, karen
          </div>
          {/* Mint jelly avatar circle (36×36px) */}
          <div
            className={css((t) => ({
              width: "36px",
              height: "36px",
              minWidth: "36px",
              borderRadius: "999px",
              background: "rgba(140, 220, 180, 0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              fontFamily: '"Instrument Serif", serif',
              fontWeight: "400",
              color: "white",
              boxShadow: "inset 0 1.5px 1px rgba(255,255,255,0.95), inset 0 -2px 4px rgba(120,30,80,0.18), 0 4px 14px -4px rgba(255,79,138,0.35)",
            }))}
          >
            K
          </div>
        </div>

        {/* Display heading: "here's what i found" or "your inbox is calm" (when idle) */}
        <h1
          className={css((t) => ({
            fontSize: "34px",
            fontFamily: '"Instrument Serif", serif',
            fontWeight: "400",
            fontStyle: "normal",
            lineHeight: "1.0",
            margin: "0",
            color: "#2A0E1A",
            letterSpacing: "-0.015em",
          }))}
        >
          {suggestionsWithIds.length === 0 ? (
            <>
              your inbox is{" "}
              <span
                style={{
                  fontStyle: "italic",
                }}
              >
                calm
              </span>
            </>
          ) : (
            <>
              here's what i{" "}
              <span
                style={{
                  fontStyle: "italic",
                }}
              >
                found
              </span>
            </>
          )}
        </h1>
      </div>

      {/* Today Card */}
      <div
        className={css((t) => ({
          padding: `0 ${t.spacing(3)} 0`,
          flexShrink: 0,
        }))}
      >
        {todayCardElement}
      </div>

      {/* Chat area (flex: 1, scrollable) */}
      <div
        className={css((t) => ({
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          padding: `${t.spacing(3)} 0 0`,
          overflow: "hidden",
        }))}
      >
        <ChatPanel
          title="Chat"
          messages={messages}
          loading={loading}
          initLoading={initLoading}
          error={error}
          input=""
          onInputChange={() => {}}
          onSend={() => {}}
          placeholder=""
          emptyState="No messages yet. Start with a broad inbox question."
          mentionSuggestions={mentionSuggestions}
          textareaRef={textareaRef}
          suppressInput={true}
          hasMore={hasMore}
          paginationLoading={paginationLoading}
          onLoadMore={onLoadMore}
        />
      </div>

      {/* Fixed input bar at bottom */}
      <div
        ref={inputBarWrapperRef}
        className={css((t) => ({
          minHeight: "54px",
          padding: `${t.spacing(2)} ${t.spacing(3)} calc(${t.spacing(2)} + env(safe-area-inset-bottom, 0px))`,
          display: "flex",
          gap: "0",
          background: "transparent",
          flexShrink: 0,
          boxSizing: "border-box",
        }))}
      >
        <ChatInputBar
          input={input}
          onInputChange={onInputChange}
          onSend={onSend}
          placeholder="ask mailania anything…"
          mentionSuggestions={mentionSuggestions}
          textareaRef={textareaRef}
          loading={loading}
        />
      </div>
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
