/**
 * ChatInputBar — Extracted input area (textarea + send button + mention dropdown)
 * 
 * This is used by ChatPanel on desktop (inline) and by MobileSwipePane on mobile (fixed bar).
 * All mention logic, keyboard navigation, and auto-resize is contained here.
 */

import { useEffect, useRef, useState } from "react";
import { css } from "@flow-css/core/css";
import { KIND_LABELS } from "./TriageSuggestions";

interface MentionSuggestion {
  id: string;
  title: string;
  kind: string;
}

export function ChatInputBar({
  input,
  onInputChange,
  onSend,
  placeholder,
  mentionSuggestions = [],
  textareaRef,
  loading = false,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  mentionSuggestions?: Array<{id: string, title: string, kind: string}>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  loading?: boolean;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Use provided textareaRef or fallback to internal
  const activeTextareaRef = textareaRef || internalRef;
  
  // Mention dropdown state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionAnchorIndex, setMentionAnchorIndex] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Detect @-mentions and manage dropdown
  const handleInputChange = (newInput: string) => {
    onInputChange(newInput);
    
    // Check for @ at word boundary (start of string or preceded by whitespace)
    const atIndex = newInput.lastIndexOf("@");
    if (atIndex === -1 || (atIndex > 0 && !/\s/.test(newInput[atIndex - 1]))) {
      setMentionActive(false);
      return;
    }
    
    // Extract query from @ to cursor
    const query = newInput.slice(atIndex + 1);
    
    // Close dropdown if query contains space (user typed space after @word)
    if (query.includes(" ")) {
      setMentionActive(false);
      return;
    }
    
    // Close dropdown if we've backspaced past the @
    if (mentionActive && atIndex < mentionAnchorIndex) {
      setMentionActive(false);
      return;
    }
    
    setMentionActive(true);
    setMentionAnchorIndex(atIndex);
    setMentionQuery(query);
    setHighlightedIndex(0);
  };

  // Filter suggestions by query
  const filteredSuggestions = mentionSuggestions.filter((s) =>
    s.title.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // Handle mention selection
  const selectMention = (suggestion: MentionSuggestion | undefined) => {
    if (!suggestion) return;
    const before = input.slice(0, mentionAnchorIndex);
    const mentionText = `@[${suggestion.title}](${suggestion.id})`;
    const after = input.slice(mentionAnchorIndex + mentionQuery.length + 1);
    const newInput = before + mentionText + " " + after;
    onInputChange(newInput);
    setMentionActive(false);
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionActive) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredSuggestions.length === 0) return;
      setHighlightedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredSuggestions.length === 0) return;
      setHighlightedIndex((prev) => (prev + 1) % filteredSuggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        const clampedIndex = Math.min(highlightedIndex, filteredSuggestions.length - 1);
        selectMention(filteredSuggestions[clampedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionActive(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    if (!mentionActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        activeTextareaRef.current &&
        !activeTextareaRef.current.contains(event.target as Node)
      ) {
        setMentionActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mentionActive]);

  // Auto-resize textarea
  // - Starts at 44px (single line)
  // - Expands up to ~120px (5 lines, based on ~24px per line)
  // - Never shows scrollbar during expansion — grows to fit
  // - Shrinks back to single line when cleared
  useEffect(() => {
    const textarea = activeTextareaRef.current;
    if (!textarea) return;

    // Reset height to auto to measure natural scrollHeight
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    
    // Cap height at 120px (roughly 5 lines), default to 44px (1 line)
    const maxHeight = 120;
    const minHeight = 44;
    const nextHeight = Math.max(Math.min(scrollHeight, maxHeight), minHeight);
    
    textarea.style.height = `${nextHeight}px`;
    // Only show scrollbar if content exceeds max height
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  return (
    <div
      className={css((t) => ({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px",
        paddingLeft: "18px",
        borderRadius: "999px",
        background: "rgba(255, 255, 255, 0.55)",
        backdropFilter: "blur(24px) saturate(1.6)",
        border: "1px solid rgba(255, 255, 255, 0.85)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
        width: "100%",
        minWidth: 0,
        position: "relative",
      }))}
    >
      <div
        className={css((t) => ({
          flex: 1,
          minWidth: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          minHeight: "44px",
        }))}
      >
        <textarea
          ref={activeTextareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={loading}
          className={css((t) => ({
            flex: 1,
            minWidth: 0,
            minHeight: "44px",
            maxHeight: "120px",
            padding: "10px 0",
            border: "none",
            borderRadius: "0",
            fontSize: "14px",
            resize: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
            outline: "none",
            transition: "all 0.3s ease",
            overflowX: "hidden",
            overflowY: "auto",
            boxSizing: "border-box",
            width: "100%",
            background: "transparent",
            backdropFilter: "none",
            boxShadow: "none",
            color: "#2A0E1A",
            "&::placeholder": { color: "rgba(168, 123, 149, 0.7)" },
            "&:focus": { outline: "none" },
            "&:focus-visible": { outline: "none" },
            "&:disabled": { opacity: 0.6 },
          }))}
        />
        
        {/* Mention dropdown */}
        {mentionActive && mentionSuggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className={css((t) => ({
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              right: 0,
              background: "rgba(255, 255, 255, 0.32)",
              backdropFilter: "blur(14px) saturate(1.4)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
              borderRadius: t.radiusCard,
              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
              maxHeight: "200px",
              overflowY: "auto",
              zIndex: 1000,
            }))}
          >
            {filteredSuggestions.length === 0 ? (
              <div
                className={css((t) => ({
                  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                  fontSize: t.fontSize.xs,
                  color: t.colors.textMuted,
                  textAlign: "center",
                }))}
              >
                No matching suggestions
              </div>
            ) : (
              filteredSuggestions.map((suggestion, idx) => (
                <div
                  key={suggestion.id}
                  onClick={() => selectMention(suggestion)}
                  className={css((t) => ({
                    padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                    borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: t.spacing(2),
                    fontSize: t.fontSize.sm,
                    "&:last-child": { borderBottom: "none" },
                    "&:hover": { background: "rgba(255, 255, 255, 0.25)" },
                  }))}
                  style={idx === highlightedIndex ? { background: "rgba(255, 255, 255, 0.25)" } : undefined}
                >
                  <span className={css({ fontSize: "0.85rem", flexShrink: 0 })}>
                    {KIND_LABELS[suggestion.kind as keyof typeof KIND_LABELS]?.icon ?? "📝"}
                  </span>
                  <div className={css({ flex: 1, minWidth: 0, overflow: "hidden" })}>
                    <div className={css((t) => ({ fontWeight: t.fontWeight.medium, fontSize: t.fontSize.sm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))}>
                      {suggestion.title}
                    </div>
                    <div className={css((t) => ({ fontSize: t.fontSize.xs, color: t.colors.textMuted }))}>
                      {KIND_LABELS[suggestion.kind as keyof typeof KIND_LABELS]?.label ?? suggestion.kind}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {/* Empty state */}
        {mentionActive && mentionSuggestions.length === 0 && (
          <div
            ref={dropdownRef}
            className={css((t) => ({
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              right: 0,
              background: "rgba(255, 255, 255, 0.32)",
              backdropFilter: "blur(14px) saturate(1.4)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
              borderRadius: t.radiusCard,
              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 24px -8px rgba(255, 79, 138, 0.25)",
              zIndex: 1000,
            }))}
          >
            <div
              className={css((t) => ({
                padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                fontSize: t.fontSize.xs,
                color: t.colors.textMuted,
                textAlign: "center",
              }))}
            >
              No pending suggestions
            </div>
          </div>
        )}
      </div>
      
      <button
        onClick={() => onSend()}
        disabled={loading || !input.trim() || mentionActive}
        className={css((t) => ({
          width: "40px",
          height: "40px",
          minWidth: "40px",
          minHeight: "40px",
          border: "none",
          background: "rgba(255, 79, 138, 0.85)",
          color: "white",
          borderRadius: "999px",
          cursor: "pointer",
          fontSize: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 120ms ease",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 4px rgba(120, 30, 80, 0.18), 0 12px 32px -12px rgba(255, 79, 138, 0.35)",
          fontWeight: "600",
          flexShrink: 0,
          "&:hover:not(:disabled)": { background: "rgba(255, 79, 138, 0.95)", boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 4px rgba(120, 30, 80, 0.2), 0 16px 40px rgba(255, 79, 138, 0.4)" },
          "&:focus-visible": { outline: "2px solid #FF4F8A", outlineOffset: "2px" },
          "&:active:not(:disabled)": { transform: "scale(0.96)" },
          "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
        }))}
      >
        ↑
      </button>
    </div>
  );
}
