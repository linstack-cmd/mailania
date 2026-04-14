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
  useEffect(() => {
    const textarea = activeTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 180);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [input]);

  return (
    <div
      className={css((t) => ({
        display: "flex",
        gap: t.spacing(2),
        width: "100%",
        minWidth: 0,
        alignItems: "flex-end",
        position: "relative",
      }))}
    >
      <div
        className={css((t) => ({
          flex: 1,
          minWidth: 0,
          maxWidth: "100%",
          position: "relative",
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
            maxWidth: "100%",
            minHeight: "44px",
            maxHeight: "180px",
            padding: `${t.spacing(2)} ${t.spacing(3)}`,
            border: "1px solid rgba(217, 70, 166, 0.08)",
            borderRadius: t.radiusInput,
            fontSize: t.fontSize.sm,
            resize: "none",
            fontFamily: "inherit",
            lineHeight: t.lineHeight.normal,
            outline: "none",
            transition: "all 0.3s ease",
            overflowX: "hidden",
            overflowY: "auto",
            boxSizing: "border-box",
            width: "100%",
            background: "white",
            boxShadow: "0 4px 16px rgba(217, 70, 166, 0.1)",
            "&:focus": { borderColor: "rgba(217, 70, 166, 0.2)", boxShadow: "0 6px 24px rgba(217, 70, 166, 0.18)", background: "#fafafa" },
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
              background: t.colors.bg,
              border: "1px solid rgba(217, 70, 166, 0.15)",
              borderRadius: t.radiusCard,
              boxShadow: "0 8px 24px rgba(217, 70, 166, 0.15)",
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
                    borderBottom: "1px solid rgba(217, 70, 166, 0.08)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: t.spacing(2),
                    fontSize: t.fontSize.sm,
                    "&:last-child": { borderBottom: "none" },
                    "&:hover": { background: "rgba(217, 70, 166, 0.04)" },
                  }))}
                  style={idx === highlightedIndex ? { background: "rgba(217, 70, 166, 0.08)" } : undefined}
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
              background: t.colors.bg,
              border: "1px solid rgba(217, 70, 166, 0.15)",
              borderRadius: t.radiusCard,
              boxShadow: "0 8px 24px rgba(217, 70, 166, 0.15)",
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
          width: "48px",
          height: "48px",
          border: "none",
          background: t.gradients.button,
          color: "white",
          borderRadius: "50%",
          cursor: "pointer",
          fontSize: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s ease",
          boxShadow: "0 6px 18px rgba(217, 70, 166, 0.28)",
          fontWeight: "600",
          flexShrink: 0,
          "&:hover:not(:disabled)": { transform: "scale(1.08) translateY(-2px)", boxShadow: "0 10px 26px rgba(217, 70, 166, 0.35)" },
          "&:focus-visible": { outline: "none" },
          "&:active:not(:disabled)": { transform: "scale(0.96)" },
          "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
        }))}
      >
        ⏎
      </button>
    </div>
  );
}
