import { useEffect, useRef, useState } from "react";
import { css } from "@flow-css/core/css";
import { KIND_LABELS } from "./TriageSuggestions";

function canSafelyAutoFocus(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  streaming?: boolean; // true if this message is still receiving tokens
  toolStatus?: string; // Tool execution status (e.g., "⚙️ Executing: search_emails...")
}

interface MentionSuggestion {
  id: string;
  title: string;
  kind: string;
}

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: bold (**), italic (*), inline code (`), code blocks (```),
 * bullet lists, numbered lists, and links.
 */
function MarkdownRenderer({ text }: { text: string }) {
  // Split by code blocks first
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let codeBlockCount = 0;

  text.replace(codeBlockRegex, (match, lang, content, offset) => {
    // Add text before code block
    if (offset > lastIndex) {
      parts.push(parseInlineMarkdown(text.slice(lastIndex, offset)));
    }
    // Add code block
    parts.push(
      <pre
        key={`code-${codeBlockCount}`}
        className={css((t) => ({
          background: "#1e1e1e",
          color: "#e0e0e0",
          padding: t.spacing(3),
          borderRadius: t.radiusSm,
          overflow: "auto",
          fontSize: "0.85em",
          lineHeight: t.lineHeight.normal,
          margin: `${t.spacing(1.5)} 0`,
        }))}
      >
        <code>{content.trim()}</code>
      </pre>
    );
    lastIndex = offset + match.length;
    codeBlockCount++;
    return match;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(parseInlineMarkdown(text.slice(lastIndex)));
  }

  return <>{parts}</>;
}

/**
 * Parse inline markdown: bold, italic, code, lists, links.
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Split into lines to handle lists
  const lines = remaining.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol
          key={`ol-${key++}`}
          className={css((t) => ({
            marginLeft: t.spacing(4),
            marginTop: t.spacing(1),
            marginBottom: t.spacing(1),
          }))}
        >
          {listItems.map((item, idx) => (
            <li key={idx} className={css((t) => ({ marginBottom: t.spacing(0.5) }))}>
              {parseInlineFormats(item)}
            </li>
          ))}
        </ol>
      );
    }
    // Bullet list
    else if (/^[-*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      nodes.push(
        <ul
          key={`ul-${key++}`}
          className={css((t) => ({
            marginLeft: t.spacing(4),
            marginTop: t.spacing(1),
            marginBottom: t.spacing(1),
          }))}
        >
          {listItems.map((item, idx) => (
            <li key={idx} className={css((t) => ({ marginBottom: t.spacing(0.5) }))}>
              {parseInlineFormats(item)}
            </li>
          ))}
        </ul>
      );
    }
    // Regular paragraph
    else {
      if (line.trim()) {
        nodes.push(
          <p key={`p-${key++}`} className={css((t) => ({ margin: `${t.spacing(1)} 0` }))}>
            {parseInlineFormats(line)}
          </p>
        );
      }
      i++;
    }
  }

  return nodes.length === 0 ? null : nodes;
}

/**
 * Parse inline formats: bold (**), italic (*), code (`), links.
 */
function parseInlineFormats(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;

  // Link pattern: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  // Bold pattern: **text**
  const boldRegex = /\*\*([^\*]+)\*\*/g;
  // Italic pattern: *text* (but not ** which is bold)
  const italicRegex = /(?<!\*)\*([^\*]+)\*(?!\*)/g;
  // Inline code: `text`
  const codeRegex = /`([^`]+)`/g;

  let remaining = text;
  let lastIndex = 0;

  // Create a combined regex that matches all patterns
  const combinedRegex = /(\*\*[^\*]+\*\*|(?<!\*)\*[^\*]+\*(?!\*)|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;

  let match;
  while ((match = combinedRegex.exec(remaining)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index));
    }

    const matched = match[0];

    // Bold
    if (matched.startsWith("**") && matched.endsWith("**")) {
      const content = matched.slice(2, -2);
      parts.push(
        <strong key={`b-${key++}`} className={css({ fontWeight: "700" })}>
          {content}
        </strong>
      );
    }
    // Italic (single asterisk)
    else if (matched.startsWith("*") && matched.endsWith("*") && !matched.startsWith("**")) {
      const content = matched.slice(1, -1);
      parts.push(
        <em key={`i-${key++}`} className={css({ fontStyle: "italic" })}>
          {content}
        </em>
      );
    }
    // Inline code
    else if (matched.startsWith("`") && matched.endsWith("`")) {
      const content = matched.slice(1, -1);
      parts.push(
        <code
          key={`ic-${key++}`}
          className={css((t) => ({
            background: t.colors.bgAlt,
            padding: `0 ${t.spacing(0.75)}`,
            borderRadius: t.radiusSm,
            fontSize: "0.9em",
            fontFamily: "monospace",
          }))}
        >
          {content}
        </code>
      );
    }
    // Link
    else if (matched.startsWith("[") && matched.includes("](")) {
      const linkMatch = matched.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const [, linkText, linkUrl] = linkMatch;
        parts.push(
          <a
            key={`l-${key++}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={css((t) => ({
              color: t.colors.primary,
              textDecoration: "underline",
              transition: "opacity 0.15s",
              "&:hover": { opacity: 0.7 },
            }))}
          >
            {linkText}
          </a>
        );
      }
    } else {
      parts.push(matched);
    }

    lastIndex = combinedRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex));
  }

  return parts.length === 0 ? null : parts;
}

export function ChatPanel({
  title,
  subtitle,
  messages,
  loading,
  initLoading,
  error,
  input,
  onInputChange,
  onSend,
  placeholder,
  emptyState,
  assistantName = "Mailania",
  starterPrompts,
  onMountChange,
  mentionSuggestions = [],
  textareaRef,
}: {
  title: string;
  subtitle?: string;
  messages: ChatMessageData[];
  loading: boolean;
  initLoading: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  emptyState: string;
  assistantName?: string;
  starterPrompts?: string[];
  onMountChange?: (mounted: boolean) => void;
  mentionSuggestions?: Array<{id: string, title: string, kind: string}>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const prevLoadingRef = useRef(loading);
  
  // Use provided textareaRef or default to internal ref
  const activeTextareaRef = textareaRef || chatInputRef;
  
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

  useEffect(() => {
    const textarea = activeTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 180);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    onMountChange?.(true);
    return () => onMountChange?.(false);
  }, [onMountChange]);

  useEffect(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;

    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevLoadingRef.current = loading;
      return;
    }

    const finishedLoading = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;

    if (finishedLoading && canSafelyAutoFocus()) {
      activeTextareaRef.current?.focus();
    }
  }, [loading]);

  return (
    <div
      className={css((t) => ({
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        overflow: "hidden",
        background: t.colors.bg,
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: "200px",
        boxSizing: "border-box",
        "@media (max-width: 640px)": {
          flex: "1",
          minHeight: "180px",
        },
      }))}
    >
      <div
        className={css((t) => ({
          padding: `${t.spacing(3)} ${t.spacing(4)}`,
          background: t.colors.bgAlt,
          borderBottom: `1px solid ${t.colors.borderLight}`,
          flexShrink: 0,
        }))}
      >
        <div
          className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(2),
            fontWeight: t.fontWeight.bold,
            fontSize: t.fontSize.sm,
          }))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:0,verticalAlign:"middle"}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>{title}</span>
          {messages.length > 0 && (
            <span
              className={css((t) => ({
                fontSize: t.fontSize.xs,
                color: t.colors.textMuted,
                fontWeight: t.fontWeight.medium,
              }))}
            >
              ({messages.length} message{messages.length !== 1 ? "s" : ""})
            </span>
          )}
        </div>
        {subtitle && (
          <p
            className={css((t) => ({
              margin: `${t.spacing(1.5)} 0 0`,
              fontSize: t.fontSize.xs,
              color: t.colors.textMuted,
              lineHeight: t.lineHeight.normal,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }))}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div
        ref={chatScrollRef}
        className={css((t) => ({
          maxHeight: "420px",
          minHeight: "80px",
          overflowY: "auto",
          overflowX: "hidden",
          padding: t.spacing(3),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(2.5),
          scrollbarWidth: "thin",
          scrollbarColor: "#d1d5db transparent",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          flex: "1 1 auto",
          "@media (max-width: 640px)": {
            flex: "1",
            minHeight: "200px",
            maxHeight: "none",
            padding: t.spacing(2.5),
          },
          "@media (max-width: 360px)": {
            paddingBottom: "65px",
          },
        }))}
      >
        {initLoading && (
          <div
            className={css((t) => ({
              textAlign: "center",
              color: t.colors.textMuted,
              fontSize: t.fontSize.sm,
              padding: t.spacing(4),
            }))}
          >
            Loading chat…
          </div>
        )}

        {!initLoading && messages.length === 0 && (
          <div
            className={css((t) => ({
              textAlign: "center",
              color: t.colors.textMuted,
              fontSize: t.fontSize.sm,
              padding: t.spacing(4),
              lineHeight: t.lineHeight.relaxed,
            }))}
          >
            {emptyState}
          </div>
        )}

        {!initLoading && messages.length === 0 && starterPrompts && starterPrompts.length > 0 && (
          <div
            className={css((t) => ({
              display: "flex",
              flexWrap: "wrap",
              gap: t.spacing(1.5),
              justifyContent: "center",
            }))}
          >
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onInputChange(prompt)}
                disabled={loading}
                className={css((t) => ({
                  border: `1px solid ${t.colors.border}`,
                  background: t.colors.bgAlt,
                  color: t.colors.text,
                  borderRadius: "999px",
                  padding: `${t.spacing(1.5)} ${t.spacing(2.5)}`,
                  fontSize: t.fontSize.xs,
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s, background 0.15s",
                  maxWidth: "100%",
                  wordBreak: "break-word",
                  textAlign: "center",
                  "&:hover:not(:disabled)": {
                    borderColor: t.colors.primary,
                    color: t.colors.primary,
                    background: t.colors.primaryLight,
                  },
                  "&:disabled": {
                    opacity: 0.5,
                    cursor: "not-allowed",
                  },
                }))}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} assistantName={assistantName} />
        ))}

        {loading && (
          <div className={chatRowAssistantClass}>
            <div className={chatBubbleAssistantClass}>Thinking…</div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {error && (
        <div
          className={css((t) => ({
            padding: `${t.spacing(2)} ${t.spacing(4)}`,
            background: "#fef2f2",
            color: t.colors.error,
            fontSize: t.fontSize.xs,
            borderTop: `1px solid ${t.colors.borderLight}`,
            flexShrink: 0,
          }))}
        >
          {error}
        </div>
      )}

      <div
        className={css((t) => ({
          display: "flex",
          gap: t.spacing(2),
          padding: t.spacing(3),
          borderTop: `1px solid ${t.colors.borderLight}`,
          background: t.colors.bg,
          minWidth: 0,
          alignItems: "flex-end",
          flexShrink: 0,
          position: "relative",
          "@media (max-width: 640px)": {
            padding: t.spacing(2),
            gap: t.spacing(1.5),
            flexDirection: "column",
            alignItems: "stretch",
            width: "100%",
            boxSizing: "border-box",
          },
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
            ref={activeTextareaRef || chatInputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={loading}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }}
            className={css((t) => ({
              flex: 1,
              minWidth: 0,
              maxWidth: "100%",
              minHeight: "44px",
              maxHeight: "180px",
              padding: `${t.spacing(2)} ${t.spacing(3)}`,
              border: `1px solid ${t.colors.border}`,
              borderRadius: t.radiusSm,
              fontSize: t.fontSize.sm,
              resize: "none",
              fontFamily: "inherit",
              lineHeight: t.lineHeight.normal,
              outline: "none",
              transition: "border-color 0.15s",
              overflowX: "hidden",
              overflowY: "auto",
              boxSizing: "border-box",
              width: "100%",
              "&:focus": { borderColor: t.colors.primary },
              "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "-2px" },
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
                border: `1px solid ${t.colors.border}`,
                borderRadius: t.radiusSm,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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
                      borderBottom: `1px solid ${t.colors.borderLight}`,
                      cursor: "pointer",
                      transition: "background 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: t.spacing(2),
                      fontSize: t.fontSize.sm,
                      "&:last-child": { borderBottom: "none" },
                      "&:hover": { background: t.colors.primaryLight },
                    }))}
                    style={idx === highlightedIndex ? { background: "#eef2ff" } : undefined}
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
                border: `1px solid ${t.colors.border}`,
                borderRadius: t.radiusSm,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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
          onClick={onSend}
          disabled={loading || !input.trim() || mentionActive}
          className={css((t) => ({
            padding: `${t.spacing(2)} ${t.spacing(3.5)}`,
            border: "none",
            borderRadius: t.radiusSm,
            background: t.colors.primary,
            color: "#fff",
            cursor: "pointer",
            fontSize: t.fontSize.sm,
            fontWeight: t.fontWeight.bold,
            transition: "background 0.15s, opacity 0.15s, outline 0.15s",
            alignSelf: "flex-end",
            minHeight: "44px",
            flexShrink: 0,
            "@media (max-width: 640px)": {
              width: "100%",
              alignSelf: "stretch",
            },
            "&:hover:not(:disabled)": { background: t.colors.primaryHover },
            "&:focus-visible": { outline: `2px solid ${t.colors.primary}`, outlineOffset: "2px" },
            "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
          }))}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const chatRowUserClass = css((t) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: t.spacing(0.5),
}));

const chatRowAssistantClass = css((t) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: t.spacing(0.5),
}));

const chatBubbleUserClass = css((t) => ({
  maxWidth: "85%",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  borderRadius: "12px",
  borderBottomRightRadius: "4px",
  fontSize: t.fontSize.sm,
  lineHeight: t.lineHeight.relaxed,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
  background: t.colors.primary,
  color: "#fff",
  "@media (max-width: 640px)": {
    maxWidth: "92%",
    padding: `${t.spacing(2.25)} ${t.spacing(2.5)}`,
  },
}));

const chatBubbleAssistantClass = css((t) => ({
  maxWidth: "85%",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  borderRadius: "12px",
  borderBottomLeftRadius: "4px",
  fontSize: t.fontSize.sm,
  lineHeight: t.lineHeight.relaxed,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
  background: t.colors.bgAlt,
  color: t.colors.text,
  border: `1px solid ${t.colors.borderLight}`,
  "@media (max-width: 640px)": {
    maxWidth: "92%",
    padding: `${t.spacing(2.25)} ${t.spacing(2.5)}`,
  },
}));

const chatMetaClass = css((t) => ({
  fontSize: t.fontSize.xs,
  color: t.colors.textMuted,
  padding: "0 4px",
  maxWidth: "100%",
  overflowWrap: "anywhere",
}));

function ChatBubble({ msg, assistantName }: { msg: ChatMessageData; assistantName: string }) {
  const isUser = msg.role === "user";
  return (
    <div className={isUser ? chatRowUserClass : chatRowAssistantClass}>
      {msg.toolStatus && (
        <div
          className={css((t) => ({
            maxWidth: "85%",
            padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
            borderRadius: "12px",
            borderBottomLeftRadius: "4px",
            fontSize: t.fontSize.xs,
            color: t.colors.textMuted,
            background: t.colors.bgAlt,
            border: `1px solid ${t.colors.borderLight}`,
            fontStyle: "italic",
            "@media (max-width: 640px)": {
              maxWidth: "92%",
            },
          }))}
        >
          {msg.toolStatus}
        </div>
      )}
      <div className={isUser ? chatBubbleUserClass : chatBubbleAssistantClass}>
        {isUser ? msg.content : <MarkdownRenderer text={msg.content} />}
      </div>
      <span className={chatMetaClass}>
        {isUser ? "You" : assistantName} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        {msg.streaming && <span> · streaming…</span>}
      </span>
    </div>
  );
}
