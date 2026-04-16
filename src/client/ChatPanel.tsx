import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { css } from "@flow-css/core/css";
import { KIND_LABELS } from "./TriageSuggestions";
import { ChatInputBar } from "./ChatInputBar";

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
            background: "rgba(0, 0, 0, 0.2)",
            color: "white",
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
              color: "rgba(255, 255, 255, 0.9)",
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
  suppressInput = false,
  hasMore = true,
  paginationLoading = false,
  onLoadMore,
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
  suppressInput?: boolean;
  hasMore?: boolean;
  paginationLoading?: boolean;
  onLoadMore?: (beforeId: string) => void;
}) {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const prevLoadingRef = useRef(loading);
  const scrollHeightBeforePrependRef = useRef(0);
  const scrollTopBeforePrependRef = useRef(0);
  const oldestMessageIdRef = useRef<string | null>(null);
  const hasInitialScrolledRef = useRef(false);
  
  // Use provided textareaRef or default to internal ref
  const activeTextareaRef = textareaRef || chatInputRef;

  useEffect(() => {
    onMountChange?.(true);
    return () => onMountChange?.(false);
  }, [onMountChange]);

  // Scroll position preservation when prepending messages
  useLayoutEffect(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;

    // Initial load: scroll to bottom unconditionally on first batch of messages
    if (messages.length > 0 && hasInitialScrolledRef.current === false) {
      scroller.scrollTop = scroller.scrollHeight;
      hasInitialScrolledRef.current = true;
      return;
    }

    // If we're at the bottom (initial load or new message), scroll to bottom
    const isAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
    
    if (isAtBottom || loading) {
      // New message incoming or initial state — scroll to bottom
      scroller.scrollTop = scroller.scrollHeight;
    } else if (scrollHeightBeforePrependRef.current > 0) {
      // We prepended messages — preserve scroll position relative to content
      const heightDiff = scroller.scrollHeight - scrollHeightBeforePrependRef.current;
      scroller.scrollTop = scrollTopBeforePrependRef.current + heightDiff;
      scrollHeightBeforePrependRef.current = 0;
      scrollTopBeforePrependRef.current = 0;
    }
  }, [messages, loading]);

  // Update oldestMessageIdRef when messages change (but don't rebuild observer)
  useEffect(() => {
    oldestMessageIdRef.current = messages.length > 0 ? messages[0].id : null;
  }, [messages]);

  // IntersectionObserver for pagination sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !paginationLoading) {
          const oldestMessageId = oldestMessageIdRef.current;
          if (oldestMessageId) {
            // Record scroll state before load
            const scroller = chatScrollRef.current;
            if (scroller) {
              scrollHeightBeforePrependRef.current = scroller.scrollHeight;
              scrollTopBeforePrependRef.current = scroller.scrollTop;
            }
            // Load older messages using the id of the first (oldest) message
            onLoadMore(oldestMessageId);
          }
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, paginationLoading, onLoadMore]);

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
        border: "1px solid rgba(217, 70, 166, 0.08)",
        borderRadius: t.radiusLarge,
        overflow: "hidden",
        background: "linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(248, 187, 208, 0.12) 100%)",
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: "200px",
        boxSizing: "border-box",
        boxShadow: "0 20px 60px rgba(217, 70, 166, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
        "@media (max-width: 640px)": {
          flex: "1",
          minHeight: "180px",
        },
      }))}
    >
      {!suppressInput && <div
        className={css((t) => ({
          padding: `${t.spacing(3)} ${t.spacing(4)}`,
          background: "transparent",
          borderBottom: "1px solid rgba(217, 70, 166, 0.05)",
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
      </div>}

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
          gap: 0,
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
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
        <div style={{ flex: 1 }} />

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
                    borderColor: "#d946a6",
                    color: "#d946a6",
                    background: "rgba(217, 70, 166, 0.1)",
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

        {/* Pagination sentinel and loading indicator */}
        <div ref={sentinelRef} />
        {paginationLoading && (
          <div
            className={css((t) => ({
              textAlign: "center",
              color: t.colors.textMuted,
              fontSize: t.fontSize.xs,
              padding: t.spacing(2),
              marginBottom: t.spacing(2),
            }))}
          >
            Loading older messages…
          </div>
        )}

        {messages.map((msg, idx) => {
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const isSameSenderAsLast = prevMsg !== null && prevMsg.role === msg.role;
          return (
            <ChatBubble 
              key={msg.id} 
              msg={msg} 
              assistantName={assistantName}
              hideAvatar={isSameSenderAsLast}
            />
          );
        })}

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
            borderTop: "1px solid rgba(217, 70, 166, 0.05)",
            flexShrink: 0,
          }))}
        >
          {error}
        </div>
      )}

      {!suppressInput && (
        <div
          className={css((t) => ({
            display: "flex",
            gap: t.spacing(2),
            padding: t.spacing(3),
            borderTop: "1px solid rgba(217, 70, 166, 0.05)",
            background: "transparent",
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
          <ChatInputBar
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            placeholder={placeholder}
            mentionSuggestions={mentionSuggestions}
            textareaRef={activeTextareaRef || chatInputRef}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}

const chatRowUserClass = css((t) => ({
  display: "flex",
  gap: t.spacing(1),
  alignItems: "flex-end",
  flexDirection: "row-reverse",
  marginBottom: t.spacing(2),
}));

const chatRowAssistantClass = css((t) => ({
  display: "flex",
  gap: t.spacing(1),
  alignItems: "flex-end",
  flexDirection: "row",
  marginBottom: t.spacing(2),
}));

const avatarClass = css((t) => ({
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "600",
  fontSize: "14px",
  flexShrink: 0,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
}));

const avatarAiClass = css((t) => ({
  background: t.gradients.avatarAi,
  color: "white",
}));

const avatarUserClass = css((t) => ({
  background: t.gradients.avatarUser,
  color: "white",
}));

const chatBubbleUserClass = css((t) => ({
  maxWidth: "72%",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  borderRadius: t.radiusBubble,
  fontSize: t.fontSize.sm,
  lineHeight: t.lineHeight.relaxed,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
  background: t.gradients.userMessage,
  color: "#ffffff",
  boxShadow: t.shadowUserBubble,
  "@media (max-width: 640px)": {
    maxWidth: "85%",
    padding: `${t.spacing(2.25)} ${t.spacing(2.5)}`,
  },
}));

const chatBubbleAssistantClass = css((t) => ({
  maxWidth: "72%",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  borderRadius: t.radiusBubble,
  fontSize: t.fontSize.sm,
  lineHeight: t.lineHeight.relaxed,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
  background: t.gradients.aiMessage,
  color: "#ffffff",
  boxShadow: t.shadowAiBubble,
  "@media (max-width: 640px)": {
    maxWidth: "85%",
    padding: `${t.spacing(2.25)} ${t.spacing(2.5)}`,
  },
}));

const chatMetaClass = css((t) => ({
  fontSize: t.fontSize.xs,
  color: "#999",
  padding: "0 4px",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  marginTop: t.spacing(0.5),
}));

function ChatBubble({ msg, assistantName, hideAvatar = false }: { msg: ChatMessageData; assistantName: string; hideAvatar?: boolean }) {
  const isUser = msg.role === "user";
  const firstChar = isUser ? "Y" : "M";
  return (
    <div className={isUser ? chatRowUserClass : chatRowAssistantClass}>
      {/* Avatar — hidden if same sender as previous message */}
      <div className={`${avatarClass} ${isUser ? avatarUserClass : avatarAiClass}`} style={{ opacity: hideAvatar ? 0 : 1 }}>
        {firstChar}
      </div>
      
      <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(0.5), minWidth: 0 }))}>
        {msg.toolStatus && (
          <div
            className={css((t) => ({
              maxWidth: "72%",
              padding: `${t.spacing(1.5)} ${t.spacing(2)}`,
              borderRadius: t.radiusBubble,
              fontSize: t.fontSize.xs,
              color: "#999",
              background: "rgba(100,100,100,0.08)",
              fontStyle: "italic",
              "@media (max-width: 640px)": {
                maxWidth: "100%",
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
    </div>
  );
}
