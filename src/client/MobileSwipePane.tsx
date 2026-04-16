/**
 * MobileSwipePane — Mobile layout with horizontal swipe panes
 *
 * Two full-height panes side by side (100vw each):
 * - Left (Chat): ChatPanel with input suppressed
 * - Right (Suggestions): List of suggestion cards
 *
 * Shared input bar fixed at bottom, outside both panes.
 * Header with dynamic title and dot indicators.
 */

import { useEffect, useRef, useState } from "react";
import { css } from "@flow-css/core/css";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";
import { ChatInputBar } from "./ChatInputBar";
import type { TriageSuggestion, InboxMessage } from "./TriageSuggestions";
import { KIND_LABELS, ApprovalConfirmModal, Toast } from "./TriageSuggestions";
import { logSwipeTouchEvent } from "./mobileDebug";

interface SuggestionWithId {
  id: string;
  suggestion: TriageSuggestion;
  status: string;
}

interface MobileSwipePaneProps {
  messages: ChatMessageData[];
  loading: boolean;
  initLoading: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  mentionSuggestions: Array<{id: string, title: string, kind: string}>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  suggestionsWithIds: SuggestionWithId[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  onDismissSuggestion: (id: string) => Promise<void>;
  onAcceptSuggestion: (id: string) => void;
  onMentionSuggestion: (s: { id: string; title: string }) => void;
  onSuggestionNotification: (title: string, status: "accepted" | "dismissed") => void;
  inboxMessages?: InboxMessage[];
  status?: any;
  testMode?: boolean;
  hasMore?: boolean;
  paginationLoading?: boolean;
  onLoadMore?: (beforeId: string) => void;
}

interface MobileProposalCardProps {
  id: string;
  suggestion: TriageSuggestion;
  messageMap: Map<string, InboxMessage>;
  onAccept: () => void;
  onDismiss: () => Promise<void>;
  onMentionSuggestion?: (s: { id: string; title: string }) => void;
  onNotifyAgent?: (title: string, status: "accepted" | "dismissed") => void;
  onClose?: () => void;
}

function MobileProposalCard({
  id,
  suggestion,
  messageMap,
  onAccept,
  onDismiss,
  onMentionSuggestion,
  onNotifyAgent,
  onClose,
}: MobileProposalCardProps) {
  const kindInfo = KIND_LABELS[suggestion.kind];
  const msgCount = suggestion.messageIds?.length ?? 0;
  const canApply = suggestion.kind === "archive_bulk" || suggestion.kind === "mark_read_bulk" || suggestion.kind === "create_filter";
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss();
      onNotifyAgent?.(suggestion.title, "dismissed");
    } finally {
      setDismissing(false);
    }
  };

  const handleMention = () => {
    onMentionSuggestion?.({ id, title: suggestion.title });
    onClose?.();
  };

  const handleAccept = () => {
    onAccept();
  };

  return (
    <div
      className={css((t) => ({
        padding: t.spacing(4),
        background: "linear-gradient(135deg, rgba(217, 70, 166, 0.06), rgba(167, 139, 250, 0.06))",
        borderRadius: t.radiusCard,
        border: "1.5px solid rgba(217, 70, 166, 0.12)",
        display: "flex",
        flexDirection: "column",
        gap: t.spacing(2.5),
        transition: "all 0.3s ease",
      }))}
    >
      <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", gap: t.spacing(2) }))}>
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), flex: 1, minWidth: 0 }))}>
          <span className={css({ fontSize: "18px", flexShrink: 0 })}>
            {kindInfo.icon}
          </span>
          <div className={css({ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 })}>
            <div className={css((t) => ({ fontSize: t.fontSize.sm, fontWeight: "600", color: "#333", lineHeight: "1.35" }))}>
              {suggestion.title}
            </div>
          </div>
        </div>
        <span
          className={css((t) => ({ 
            fontSize: t.fontSize.xs, 
            fontWeight: "600", 
            textTransform: "uppercase", 
            letterSpacing: "0.5px",
            background: t.gradients.confidenceText,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            flexShrink: 0,
          }))}
        >
          {suggestion.confidence}
        </span>
      </div>

      <p
        className={css((t) => ({
          fontSize: t.fontSize.xs,
          color: "#666",
          margin: 0,
          lineHeight: "1.4",
        }))}
      >
        {suggestion.rationale}
      </p>

      {suggestion.kind === "needs_user_input" && suggestion.questions && suggestion.questions.length > 0 && (
        <div className={css((t) => ({ marginTop: t.spacing(1.5) }))}>
          <p className={css((t) => ({ fontSize: t.fontSize.xs, fontWeight: t.fontWeight.semibold, color: t.colors.text, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.03em" }))}>
            ❓ Questions for you:
          </p>
          <ul className={css((t) => ({ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }))}>
            {suggestion.questions.map((q, idx) => (
              <li key={idx} className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, lineHeight: "1.4" }))}>
                • {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.kind === "create_filter" && suggestion.filterDraft && (
        <div className={css((t) => ({ marginTop: t.spacing(1.5), fontSize: t.fontSize.xs, color: t.colors.text }))}>
          <p className={css((t) => ({ margin: "0 0 4px", fontWeight: t.fontWeight.semibold, textTransform: "uppercase", letterSpacing: "0.03em" }))}>
            🔀 Filter:
          </p>
          <div className={css((t) => ({ color: t.colors.textMuted, lineHeight: "1.4" }))}>
            {suggestion.filterDraft.from && <span>{suggestion.filterDraft.from}</span>}
            {suggestion.filterDraft.from && (suggestion.filterDraft.label || suggestion.filterDraft.archive) && <span> → </span>}
            {suggestion.filterDraft.archive && <span>archive</span>}
            {suggestion.filterDraft.archive && suggestion.filterDraft.label && <span>, </span>}
            {suggestion.filterDraft.label && <span>label: {suggestion.filterDraft.label}</span>}
          </div>
        </div>
      )}

      {msgCount > 0 && (
        <span className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted, display: "flex", alignItems: "center", gap: t.spacing(1) }))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {msgCount} message{msgCount !== 1 ? "s" : ""}
        </span>
      )}

      <div className={css((t) => ({ display: "flex", gap: t.spacing(2), marginTop: t.spacing(1) }))}>
        {canApply ? (
          <button
            onClick={handleAccept}
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "none",
              borderRadius: "16px",
              background: t.gradients.button,
              color: "#fff",
              fontWeight: "600",
              fontSize: t.fontSize.xs,
              cursor: "pointer",
              transition: "all 0.3s ease",
              minHeight: "auto",
              boxShadow: "0 4px 12px rgba(217, 70, 166, 0.2)",
              "&:hover": { transform: "translateY(-2px)", boxShadow: "0 6px 16px rgba(217, 70, 166, 0.28)" },
              "&:focus-visible": { outline: "none" },
            }))}
          >
            Accept
          </button>
        ) : (
          <button
            disabled
            className={css((t) => ({
              flex: 1,
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: "1px solid rgba(217, 70, 166, 0.15)",
              borderRadius: "16px",
              background: "rgba(217, 70, 166, 0.08)",
              color: "#d946a6",
              fontWeight: "600",
              fontSize: t.fontSize.xs,
              cursor: "not-allowed",
              minHeight: "auto",
            }))}
            title="Discuss in chat to refine this suggestion"
          >
            Needs Input
          </button>
        )}
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          title="Dismiss this suggestion"
          className={css((t) => ({
            flex: 1,
            padding: `${t.spacing(2)} ${t.spacing(3)}`,
            border: "1px solid rgba(217, 70, 166, 0.15)",
            borderRadius: "16px",
            background: "rgba(217, 70, 166, 0.08)",
            color: "#d946a6",
            fontWeight: "600",
            fontSize: t.fontSize.xs,
            cursor: "pointer",
            transition: "all 0.3s ease",
            minHeight: "auto",
            "&:hover:not(:disabled)": { background: "rgba(217, 70, 166, 0.12)", borderColor: "rgba(217, 70, 166, 0.25)" },
            "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
            "&:focus-visible": { outline: "none" },
          }))}
        >
          {dismissing ? "Dismiss…" : "Dismiss"}
        </button>
        <button
          onClick={handleMention}
          title="Mention this suggestion in the chat"
          className={css((t) => ({
            width: "44px",
            height: "44px",
            minWidth: "44px",
            minHeight: "44px",
            padding: t.spacing(2),
            border: "1.5px solid rgba(167, 139, 250, 0.4)",
            borderRadius: "16px",
            background: "transparent",
            color: "#a78bfa",
            fontSize: t.fontSize.sm,
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "600",
            "&:hover": { background: "rgba(167, 139, 250, 0.08)", borderColor: "rgba(167, 139, 250, 0.6)" },
            "&:focus-visible": { outline: "none" },
          }))}
        >
          @
        </button>
      </div>
    </div>
  );
}

export function MobileSwipePane({
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
  inboxMessages = [],
  status,
  testMode = false,
  hasMore = true,
  paginationLoading = false,
  onLoadMore,
}: MobileSwipePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputBarWrapperRef = useRef<HTMLDivElement>(null);
  const [activePaneIndex, setActivePaneIndex] = useState(0);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [vpHeight, setVpHeight] = useState<number | undefined>(undefined);

  // Touch tracking for manual scroll handling
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    locked: boolean;
    direction: "none" | "horizontal" | "vertical";
    startTime: number;
  } | null>(null);

  // Touch tracking for input bar vertical scroll prevention
  const inputBarTouchRef = useRef<{
    startY: number;
  } | null>(null);

  const messageMap = new Map<string, InboxMessage>();
  for (const m of inboxMessages) {
    messageMap.set(m.id, m);
  }

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

  // Prevent body vertical scroll when MobileSwipePane is mounted
  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  // Detect active pane on scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollLeft = container.scrollLeft;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.offsetWidth;
      const paneIndex = Math.round(scrollLeft / containerWidth);
      
      logSwipeTouchEvent("container:scroll", {
        scrollLeft,
        previousScrollLeft: lastScrollLeft,
        delta: scrollLeft - lastScrollLeft,
        paneIndex: Math.max(0, Math.min(paneIndex, 1)),
      });

      lastScrollLeft = scrollLeft;
      setActivePaneIndex(Math.max(0, Math.min(paneIndex, 1)));
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Touch handlers for manual horizontal swiping (fixes Firefox Android)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    logSwipeTouchEvent("handlers-registered", {
      containerWidth: container.offsetWidth,
      containerHeight: container.offsetHeight,
      scrollLeft: container.scrollLeft,
    });

    const DISAMBIGUATE_THRESHOLD = 10; // px of movement to lock direction
    const SNAP_THRESHOLD = 0.3; // 30% of pane width
    const VELOCITY_THRESHOLD = 0.5; // reasonable flick speed (px/ms)

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const targetElement = e.target as HTMLElement;
      
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startScrollLeft: container.scrollLeft,
        locked: false,
        direction: "none",
        startTime: Date.now(),
      };

      logSwipeTouchEvent("touchstart", {
        x: touch.clientX,
        y: touch.clientY,
        targetTag: targetElement?.tagName,
        targetClass: targetElement?.className,
        startScrollLeft: container.scrollLeft,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchRef.current) return;

      const touch = e.touches[0];
      const moveX = touch.clientX - touchRef.current.startX;
      const moveY = touch.clientY - touchRef.current.startY;
      const absMoveX = Math.abs(moveX);
      const absMoveY = Math.abs(moveY);

      // On first move, disambiguate direction
      if (!touchRef.current.locked) {
        // Once we've moved enough in one direction, lock into that direction
        if (absMoveX > DISAMBIGUATE_THRESHOLD || absMoveY > DISAMBIGUATE_THRESHOLD) {
          touchRef.current.locked = true;

          // Require horizontal to be at least 2x vertical for horizontal lock
          // This gives a strong bias toward vertical scrolling on ambiguous touches
          if (absMoveX > absMoveY * 2) {
            // Horizontal movement detected
            touchRef.current.direction = "horizontal";
            e.preventDefault();
          } else {
            // Vertical movement detected
            touchRef.current.direction = "vertical";
            // Let vertical scroll happen naturally
          }

          logSwipeTouchEvent("touchmove:lock", {
            direction: touchRef.current.direction,
            absMoveX,
            absMoveY,
            moveX,
            moveY,
            scrollLeft: container.scrollLeft,
          });
        }
        return;
      }

      // If locked into horizontal mode, drive scrollLeft
      if (touchRef.current.direction === "horizontal") {
        e.preventDefault();
        const containerWidth = container.offsetWidth;
        const newScrollLeft = touchRef.current.startScrollLeft - moveX;
        
        // Clamp to valid range [0, containerWidth]
        const clampedScrollLeft = Math.max(0, Math.min(newScrollLeft, containerWidth));
        container.scrollLeft = clampedScrollLeft;

        logSwipeTouchEvent("touchmove:horizontal", {
          direction: "horizontal",
          absMoveX,
          absMoveY,
          moveX,
          moveY,
          scrollLeft: container.scrollLeft,
          newScrollLeft,
          containerWidth,
        });
      } else if (touchRef.current.direction === "vertical") {
        logSwipeTouchEvent("touchmove:vertical", {
          direction: "vertical",
          absMoveX,
          absMoveY,
          moveX,
          moveY,
          scrollLeft: container.scrollLeft,
        });
      }
      // If vertical, do nothing — let the browser handle it
    };

    const handleTouchEnd = () => {
      if (!touchRef.current) {
        return;
      }

      const direction = touchRef.current.direction;

      const container = containerRef.current;
      if (!container) {
        touchRef.current = null;
        return;
      }

      // Log all touch ends, not just horizontal
      logSwipeTouchEvent("touchend", {
        direction,
        finalScrollLeft: container.scrollLeft,
        startScrollLeft: touchRef.current.startScrollLeft,
        duration: Date.now() - touchRef.current.startTime,
      });

      if (direction !== "horizontal") {
        touchRef.current = null;
        return;
      }

      const containerWidth = container.offsetWidth;
      const currentScrollLeft = container.scrollLeft;
      const startScrollLeft = touchRef.current.startScrollLeft;
      const dragDistance = startScrollLeft - currentScrollLeft;
      const dragPercentage = dragDistance / containerWidth;

      // Calculate velocity (distance / time)
      const elapsedTime = Date.now() - touchRef.current.startTime;
      const velocity = Math.abs(dragDistance) / Math.max(elapsedTime, 1);

      // Compute starting pane from startScrollLeft (don't use activePaneIndex to avoid mid-gesture state churn)
      const startingPaneIndex = Math.round(startScrollLeft / containerWidth);

      // Decide snap target
      let targetPaneIndex = startingPaneIndex;
      let snapReason = "default";

      if (Math.abs(dragPercentage) > SNAP_THRESHOLD) {
        // User dragged far enough to snap to next/prev pane
        // dragPercentage > 0 means scrollLeft decreased (user dragged left toward pane 0)
        targetPaneIndex = dragPercentage < 0 ? 1 : 0;
        snapReason = "threshold";
      } else if (velocity > VELOCITY_THRESHOLD) {
        // Flick velocity is high — snap in the direction of motion
        // dragDistance > 0 means scrollLeft decreased (user dragged left toward pane 0)
        targetPaneIndex = dragDistance < 0 ? 1 : 0;
        snapReason = "velocity";
      }

      // Clamp to valid panes [0, 1]
      targetPaneIndex = Math.max(0, Math.min(targetPaneIndex, 1));

      logSwipeTouchEvent("touchend:snap", {
        startingPaneIndex,
        targetPaneIndex,
        snapReason,
        dragDistance,
        dragPercentage,
        velocity,
        velocityThreshold: VELOCITY_THRESHOLD,
      });

      // Snap to target pane with animation
      const targetScrollLeft = targetPaneIndex * containerWidth;
      container.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });

      touchRef.current = null;
    };

    container.addEventListener("touchstart", handleTouchStart, false);
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, false);

    // Global window-level touchstart listener — can't be suppressed by compositor
    // so we can verify if touch events are firing at all on the device
    const handleWindowTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;
      const target = e.target as HTMLElement;

      // Get element at touch point
      const elementAtPoint = document.elementFromPoint(x, y) as HTMLElement;

      logSwipeTouchEvent("window-touchstart", {
        x,
        y,
        target: target?.tagName,
        targetClass: target?.className,
        elementAtPoint: elementAtPoint?.tagName,
        elementAtPointClass: elementAtPoint?.className,
      });
    };

    // Global window-level touchmove listener — throttled to 100ms
    // Logs scroll position and current touch point coordinates
    let lastWindowTouchMoveTime = 0;
    const handleWindowTouchMove = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastWindowTouchMoveTime < 100) {
        return;
      }
      lastWindowTouchMoveTime = now;

      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;

      logSwipeTouchEvent("window-touchmove", {
        x,
        y,
        documentScrollY: window.scrollY,
        documentScrollX: window.scrollX,
        bodyScrollTop: document.body.scrollTop,
        htmlScrollTop: document.documentElement.scrollTop,
        visualViewportOffsetTop: window.visualViewport?.offsetTop,
        visualViewportOffsetLeft: window.visualViewport?.offsetLeft,
      });
    };

    window.addEventListener("touchstart", handleWindowTouchStart, false);
    window.addEventListener("touchmove", handleWindowTouchMove, false);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchstart", handleWindowTouchStart);
      window.removeEventListener("touchmove", handleWindowTouchMove);
    };
  }, []);

  // Prevent vertical touchmove on fixed input bar (Firefox Android visual viewport pan fix)
  useEffect(() => {
    // Handler to prevent vertical touchmove on the input bar wrapper
    const handleInputBarTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      inputBarTouchRef.current = {
        startY: touch.clientY,
      };
    };

    const handleInputBarTouchMove = (e: TouchEvent) => {
      if (!inputBarTouchRef.current) return;

      const touch = e.touches[0];
      const moveY = touch.clientY - inputBarTouchRef.current.startY;
      const absMoveY = Math.abs(moveY);

      // Only process if there's meaningful vertical movement
      if (absMoveY < 2) {
        return;
      }

      const targetElement = e.target as HTMLElement;

      // Check if the touch target is the textarea
      const isTextarea = targetElement && targetElement.tagName === "TEXTAREA";

      if (isTextarea && textareaRef?.current) {
        // Textarea is the touch target. Check if it has internal scroll overflow.
        const textarea = textareaRef.current;
        const hasInternalScroll = textarea.scrollHeight > textarea.clientHeight;

        logSwipeTouchEvent("input-bar-touchmove", {
          isTextarea: true,
          hasInternalScroll,
          scrollHeight: textarea.scrollHeight,
          clientHeight: textarea.clientHeight,
          moveY,
          absMoveY,
        });

        // If textarea has internal scroll, check if it can scroll in the direction of the swipe
        if (hasInternalScroll) {
          const isSwipingDown = moveY > 0; // Finger moving down → content scrolls up
          const isSwipingUp = moveY < 0; // Finger moving up → content scrolls down
          
          const canScrollDown = textarea.scrollTop < textarea.scrollHeight - textarea.clientHeight;
          const canScrollUp = textarea.scrollTop > 0;
          
          logSwipeTouchEvent("input-bar-touchmove:scroll-check", {
            isSwipingDown,
            isSwipingUp,
            canScrollDown,
            canScrollUp,
            scrollTop: textarea.scrollTop,
            scrollHeight: textarea.scrollHeight,
            clientHeight: textarea.clientHeight,
          });

          // Only allow touchmove if textarea can scroll in the direction of the swipe
          if ((isSwipingDown && canScrollUp) || (isSwipingUp && canScrollDown)) {
            return;
          }
        }
      } else {
        logSwipeTouchEvent("input-bar-touchmove", {
          isTextarea: false,
          targetTag: targetElement?.tagName,
          moveY,
          absMoveY,
        });
      }

      // Prevent vertical touchmove on the input bar to block Firefox visual viewport pan
      e.preventDefault();
    };

    const handleInputBarTouchEnd = () => {
      inputBarTouchRef.current = null;
    };

    const handleInputBarTouchCancel = () => {
      inputBarTouchRef.current = null;
    };

    // Attach handlers to the input bar wrapper
    // We'll use a ref for the input bar wrapper below
    if (inputBarWrapperRef.current) {
      const inputBarWrapper = inputBarWrapperRef.current;
      inputBarWrapper.addEventListener("touchstart", handleInputBarTouchStart, false);
      inputBarWrapper.addEventListener("touchmove", handleInputBarTouchMove, { passive: false });
      inputBarWrapper.addEventListener("touchend", handleInputBarTouchEnd, false);
      inputBarWrapper.addEventListener("touchcancel", handleInputBarTouchCancel, false);

      return () => {
        inputBarWrapper.removeEventListener("touchstart", handleInputBarTouchStart);
        inputBarWrapper.removeEventListener("touchmove", handleInputBarTouchMove);
        inputBarWrapper.removeEventListener("touchend", handleInputBarTouchEnd);
        inputBarWrapper.removeEventListener("touchcancel", handleInputBarTouchCancel);
      };
    }
  }, [textareaRef]);

  // Handle mention button: insert text, scroll to chat, focus
  const handleMentionWithScroll = (suggestion: { id: string; title: string }) => {
    onMentionSuggestion(suggestion);
    
    // Scroll to chat pane (left = 0)
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const headerTitle = activePaneIndex === 0 ? "Mailania" : "Suggestions";

  return (
    <div
      style={{
        height: vpHeight !== undefined ? `${vpHeight}px` : "100dvh",
      }}
      className={css((t) => ({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        background: t.gradients.pageBackground,
        overflow: "hidden",
      }))}
    >
      {/* Header */}
      <div
        className={css((t) => ({
          height: "56px",
          padding: `0 ${t.spacing(4)}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 187, 208, 0.08))",
          borderBottom: "1px solid rgba(217, 70, 166, 0.08)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.6)",
          flexShrink: 0,
          gap: t.spacing(3),
        }))}
      >
        <div className={css((t) => ({
          fontSize: "16px",
          fontWeight: "600",
          color: "#1a1a1a",
          flex: 1,
        }))}>
          {headerTitle}
        </div>

        {/* Dot indicators */}
        <div className={css((t) => ({
          display: "flex",
          gap: t.spacing(1.5),
          alignItems: "center",
        }))}>
          <div
            style={{
              width: activePaneIndex === 0 ? "8px" : "6px",
              height: activePaneIndex === 0 ? "8px" : "6px",
              borderRadius: "50%",
              background: activePaneIndex === 0 ? "linear-gradient(135deg, #d946a6, #ec4899)" : "rgba(100, 100, 100, 0.3)",
              transition: "all 0.3s ease",
            }}
          />
          <div
            style={{
              width: activePaneIndex === 1 ? "8px" : "6px",
              height: activePaneIndex === 1 ? "8px" : "6px",
              borderRadius: "50%",
              background: activePaneIndex === 1 ? "linear-gradient(135deg, #d946a6, #ec4899)" : "rgba(100, 100, 100, 0.3)",
              transition: "all 0.3s ease",
            }}
          />
        </div>

        {/* Settings button */}
        <a
          href="/settings"
          title="Account settings"
          className={css((t) => ({
            width: "40px",
            height: "40px",
            background: t.gradients.avatarUser,
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: t.fontSize.base,
            textDecoration: "none",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "600",
            minHeight: "40px",
            minWidth: "40px",
            transition: "all 0.3s ease",
            boxShadow: "0 4px 12px rgba(217, 70, 166, 0.3)",
            "&:hover": { transform: "scale(1.08)", boxShadow: "0 6px 16px rgba(217, 70, 166, 0.4)" },
            "&:focus-visible": { outline: "none" },
          }))}
        >
          {status?.user?.displayName?.charAt(0).toUpperCase() || "A"}
        </a>
      </div>

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

      {/* Scroll-snap container */}
      <div
        ref={containerRef}
        className={css((t) => ({
          flex: 1,
          display: "flex",
          width: "100%",
          overflowX: "hidden",
          overflowY: "hidden",
          minHeight: 0,
          touchAction: "pan-y",
        }))}
      >
        {/* Pane 0: Chat */}
        <div
          className={css((t) => ({
            width: "100vw",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: `${t.spacing(3)} 0 0`,
            boxSizing: "border-box",
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

        {/* Pane 1: Suggestions */}
        <div
          className={css((t) => ({
            width: "100vw",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: `${t.spacing(3)} ${t.spacing(3)} calc(${t.spacing(4)} + env(safe-area-inset-bottom, 0px))`,
            gap: t.spacing(3),
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            boxSizing: "border-box",
          }))}
        >
          {suggestionsError && (
            <div
              className={css((t) => ({
                padding: t.spacing(3),
                background: "#fef2f2",
                borderRadius: t.radiusSm,
                color: t.colors.error,
                fontSize: t.fontSize.sm,
              }))}
            >
              <span>{suggestionsError}</span>
            </div>
          )}

          {suggestionsLoading && (
            <div className={css((t) => ({ textAlign: "center", padding: t.spacing(4), color: t.colors.textMuted }))}>
              Loading suggestions…
            </div>
          )}

          {!suggestionsLoading && suggestionsWithIds.length === 0 && (
            <div
              className={css((t) => ({
                textAlign: "center",
                padding: `${t.spacing(8)} ${t.spacing(4)}`,
                background: t.colors.bgAlt,
                borderRadius: t.radius,
              }))}
            >
              <div className={css({ fontSize: "2rem", marginBottom: "8px" })}>✨</div>
              <p className={css((t) => ({ fontWeight: "600", fontSize: t.fontSize.base, margin: "0 0 6px" }))}>No suggestions yet</p>
              <p className={css((t) => ({ color: t.colors.textMuted, fontSize: t.fontSize.sm, margin: 0, lineHeight: "1.5" }))}>
                Ask the chat to create suggestions for your inbox.
              </p>
            </div>
          )}

          {!suggestionsLoading && suggestionsWithIds.length > 0 && (
            <>
              {suggestionsWithIds.map((item) => (
                <MobileProposalCard
                  key={item.id}
                  id={item.id}
                  suggestion={item.suggestion}
                  messageMap={messageMap}
                  onAccept={() => setAcceptingId(item.id)}
                  onDismiss={() => onDismissSuggestion(item.id)}
                  onMentionSuggestion={handleMentionWithScroll}
                  onNotifyAgent={onSuggestionNotification}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Fixed input bar at bottom */}
      <div
        ref={inputBarWrapperRef}
        className={css((t) => ({
          minHeight: "56px",
          padding: `${t.spacing(2)} ${t.spacing(3)} calc(${t.spacing(2)} + env(safe-area-inset-bottom, 0px))`,
          display: "flex",
          gap: t.spacing(2),
          borderTop: "1px solid rgba(217, 70, 166, 0.08)",
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(248, 187, 208, 0.05))",
          flexShrink: 0,
          boxSizing: "border-box",
        }))}
      >
        <ChatInputBar
          input={input}
          onInputChange={onInputChange}
          onSend={onSend}
          placeholder="Tell me what to do…"
          mentionSuggestions={mentionSuggestions}
          textareaRef={textareaRef}
          loading={loading}
        />
      </div>

      {/* Approval modal */}
      {acceptingId && suggestionsWithIds.find((s) => s.id === acceptingId) && (
        <ApprovalConfirmModal
          suggestion={suggestionsWithIds.find((s) => s.id === acceptingId)!.suggestion}
          messageMap={messageMap}
          onClose={() => setAcceptingId(null)}
          onSuccess={(msg) => {
            const suggestion = suggestionsWithIds.find((s) => s.id === acceptingId)!;
            setAcceptingId(null);
            setToastMsg(msg);
            onSuggestionNotification(suggestion.suggestion.title, "accepted");
            onAcceptSuggestion(acceptingId);
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  );
}
