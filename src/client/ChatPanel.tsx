import { useEffect, useRef } from "react";
import { css } from "@flow-css/core/css";

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
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
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
      }))}
    >
      <div
        className={css((t) => ({
          padding: `${t.spacing(3)} ${t.spacing(4)}`,
          background: t.colors.bgAlt,
          borderBottom: `1px solid ${t.colors.borderLight}`,
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
            }))}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div
        className={css((t) => ({
          maxHeight: "420px",
          overflowY: "auto",
          padding: t.spacing(3),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(2.5),
          scrollbarWidth: "thin",
          scrollbarColor: "#d1d5db transparent",
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
              gap: t.spacing(2),
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
                  padding: `${t.spacing(1.5)} ${t.spacing(3)}`,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
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
          className={css((t) => ({
            flex: 1,
            padding: `${t.spacing(2)} ${t.spacing(3)}`,
            border: `1px solid ${t.colors.border}`,
            borderRadius: t.radiusSm,
            fontSize: "0.88rem",
            resize: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
            outline: "none",
            transition: "border-color 0.15s",
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
  background: t.colors.primary,
  color: "#fff",
}));

const chatBubbleAssistantClass = css((t) => ({
  maxWidth: "85%",
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  borderRadius: "12px",
  borderBottomLeftRadius: "4px",
  fontSize: "0.88rem",
  lineHeight: "1.6",
  whiteSpace: "pre-wrap",
  background: t.colors.bgAlt,
  color: t.colors.text,
  border: `1px solid ${t.colors.borderLight}`,
}));

const chatMetaClass = css((t) => ({
  fontSize: "0.7rem",
  color: t.colors.textMuted,
  padding: "0 4px",
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
