import { useEffect, useRef } from "react";
import { css } from "@flow-css/core/css";

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
}) {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const hasMountedRef = useRef(false);
  const prevLoadingRef = useRef(loading);

  useEffect(() => {
    const textarea = chatInputRef.current;
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
      chatInputRef.current?.focus();
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
        display: "flex",
        flexDirection: "column",
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
            fontWeight: "700",
            fontSize: "0.9rem",
          }))}
        >
          <span>💬</span>
          <span>{title}</span>
          {messages.length > 0 && (
            <span
              className={css((t) => ({
                fontSize: "0.72rem",
                color: t.colors.textMuted,
                fontWeight: "500",
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
              fontSize: "0.8rem",
              color: t.colors.textMuted,
              lineHeight: "1.5",
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
            maxHeight: "min(50dvh, 380px)",
            minHeight: "60px",
            padding: t.spacing(2.5),
          },
        }))}
      >
        {initLoading && (
          <div
            className={css((t) => ({
              textAlign: "center",
              color: t.colors.textMuted,
              fontSize: "0.85rem",
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
              fontSize: "0.85rem",
              padding: t.spacing(4),
              lineHeight: "1.6",
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
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  maxWidth: "100%",
                  wordBreak: "break-word",
                  textAlign: "center",
                  "&:hover:not(:disabled)": {
                    borderColor: t.colors.primary,
                    color: t.colors.primary,
                    background: "#eef2ff",
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
            fontSize: "0.82rem",
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
          "@media (max-width: 640px)": {
            padding: t.spacing(2),
            gap: t.spacing(1.5),
            flexDirection: "column",
            alignItems: "stretch",
          },
        }))}
      >
        <textarea
          ref={chatInputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
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
            fontSize: "0.88rem",
            resize: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
            outline: "none",
            transition: "border-color 0.15s",
            overflowX: "hidden",
            overflowY: "auto",
            boxSizing: "border-box",
            "&:focus": { borderColor: t.colors.primary },
            "&:disabled": { opacity: 0.6 },
          }))}
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          className={css((t) => ({
            padding: `${t.spacing(2)} ${t.spacing(3.5)}`,
            border: "none",
            borderRadius: t.radiusSm,
            background: t.colors.primary,
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: "700",
            transition: "background 0.15s, opacity 0.15s",
            alignSelf: "flex-end",
            minHeight: "44px",
            flexShrink: 0,
            "@media (max-width: 640px)": {
              width: "100%",
              alignSelf: "stretch",
            },
            "&:hover:not(:disabled)": { background: t.colors.primaryHover },
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
  fontSize: "0.88rem",
  lineHeight: "1.6",
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
  fontSize: "0.88rem",
  lineHeight: "1.6",
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
  fontSize: "0.7rem",
  color: t.colors.textMuted,
  padding: "0 4px",
  maxWidth: "100%",
  overflowWrap: "anywhere",
}));

function ChatBubble({ msg, assistantName }: { msg: ChatMessageData; assistantName: string }) {
  const isUser = msg.role === "user";
  return (
    <div className={isUser ? chatRowUserClass : chatRowAssistantClass}>
      <div className={isUser ? chatBubbleUserClass : chatBubbleAssistantClass}>{msg.content}</div>
      <span className={chatMetaClass}>
        {isUser ? "You" : assistantName} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}
