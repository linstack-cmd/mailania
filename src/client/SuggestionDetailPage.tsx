import { useState, useEffect, useCallback, useRef } from "react";
import { css } from "@flow-css/core/css";
import { useParams, useLocation } from "wouter";
import {
  KIND_LABELS,
  CONFIDENCE_STYLES,
  DetailSection,
  ApprovalConfirmModal,
  Toast,
  type TriageSuggestion,
  type InboxMessage,
} from "./TriageSuggestions";

// --- Chat types ---
interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

interface RevisionData {
  revisionIndex: number;
  suggestion: TriageSuggestion;
  source: string;
  createdAt?: string;
}

export default function SuggestionDetailPage() {
  const params = useParams<{ runId: string; index: string }>();
  const [, navigate] = useLocation();
  const runId = params.runId;
  const index = parseInt(params.index ?? "0", 10);

  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
  const [allSuggestions, setAllSuggestions] = useState<TriageSuggestion[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReviewed, setIsReviewed] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [latestRevision, setLatestRevision] = useState<RevisionData | null>(null);
  const [chatInitLoading, setChatInitLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const messageMap = new Map<string, InboxMessage>();
  for (const m of messages) messageMap.set(m.id, m);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [triageRes, inboxRes] = await Promise.all([
          fetch("/api/triage/latest"),
          fetch("/api/inbox"),
        ]);

        if (triageRes.status === 401 || inboxRes.status === 401) {
          navigate("/", { replace: true });
          return;
        }

        const triageData = await triageRes.json();
        const inboxData = await inboxRes.json();

        if (!triageData.suggestions || triageData.runId?.toString() !== runId) {
          setError("Triage run not found or has changed. Go back and try again.");
          setLoading(false);
          return;
        }

        const suggestions: TriageSuggestion[] = triageData.suggestions;
        if (index < 0 || index >= suggestions.length) {
          setError(`Suggestion #${index} not found in this run.`);
          setLoading(false);
          return;
        }

        setAllSuggestions(suggestions);
        setSuggestion(suggestions[index]);
        setMessages(inboxData.messages ?? []);
        setLastRunAt(triageData.createdAt);
      } catch {
        setError("Failed to load suggestion details.");
      }
      setLoading(false);
    }
    load();
  }, [runId, index]);

  // Load chat data when suggestion is available
  useEffect(() => {
    if (!runId || isNaN(index) || !suggestion) return;
    setChatInitLoading(true);
    setChatError(null);
    fetch(`/api/suggestions/${runId}/${index}/chat`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load chat");
        return r.json();
      })
      .then((data) => {
        setChatMessages(data.messages ?? []);
        setLatestRevision(data.latestRevision ?? null);
      })
      .catch(() => setChatError("Failed to load chat history"))
      .finally(() => setChatInitLoading(false));
  }, [runId, index, suggestion]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Send chat message
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading || !runId) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    // Optimistic: add user message immediately
    const tempId = `temp-${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: msg, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch(`/api/suggestions/${runId}/${index}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send message");
      }

      const data = await res.json();
      setChatMessages(data.messages);
      if (data.latestRevision) {
        setLatestRevision(data.latestRevision);
      }
    } catch (err: any) {
      setChatError(err.message || "Failed to send message");
      // Remove optimistic message on error
      setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, chatLoading, runId, index]);

  // Keyboard: Escape goes back
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") navigate("/");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate]);

  // Navigate between suggestions
  const goToSuggestion = useCallback(
    (newIndex: number) => {
      if (newIndex >= 0 && newIndex < allSuggestions.length) {
        navigate(`/suggestions/${runId}/${newIndex}`, { replace: true });
      }
    },
    [runId, allSuggestions.length, navigate],
  );

  // Arrow key navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && index > 0) goToSuggestion(index - 1);
      if (e.key === "ArrowRight" && index < allSuggestions.length - 1) goToSuggestion(index + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, allSuggestions.length, goToSuggestion]);

  if (loading) return <DetailPageSkeleton />;

  if (error) {
    return (
      <div className={css((t) => ({ maxWidth: "680px", margin: "0 auto", padding: `${t.spacing(8)} ${t.spacing(5)}` }))}>
        <button onClick={() => navigate("/")} className={backBtnClass}>
          ← Back to Triage
        </button>
        <div
          className={css((t) => ({
            marginTop: t.spacing(6),
            padding: t.spacing(6),
            background: "#fef2f2",
            borderRadius: t.radius,
            color: t.colors.error,
            fontSize: "0.95rem",
            textAlign: "center",
            lineHeight: "1.6",
          }))}
        >
          <div style={{ fontSize: "1.8rem", marginBottom: "8px" }}>😕</div>
          {error}
        </div>
      </div>
    );
  }

  if (!suggestion) return null;

  const kindInfo = KIND_LABELS[suggestion.kind];
  const confStyle = CONFIDENCE_STYLES[suggestion.confidence] ?? CONFIDENCE_STYLES.low;
  const isExecutable = suggestion.kind === "archive_bulk" || suggestion.kind === "create_filter";

  const resolvedMessages = suggestion.messageIds
    ?.map((id) => messageMap.get(id))
    .filter((m): m is InboxMessage => !!m);

  return (
    <div className={css((t) => ({ maxWidth: "720px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(5)} ${t.spacing(10)}` }))}>
      {/* Back + nav bar */}
      <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(3), marginBottom: t.spacing(5) }))}>
        <button onClick={() => navigate("/")} className={backBtnClass}>
          ← Back to Triage
        </button>
        {allSuggestions.length > 1 && (
          <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2) }))}>
            <button
              onClick={() => goToSuggestion(index - 1)}
              disabled={index === 0}
              className={navArrowClass}
              aria-label="Previous suggestion"
              title="Previous (← arrow key)"
            >
              ‹
            </button>
            <span className={css((t) => ({ fontSize: "0.8rem", color: t.colors.textMuted, fontVariantNumeric: "tabular-nums" }))}>
              {index + 1} / {allSuggestions.length}
            </span>
            <button
              onClick={() => goToSuggestion(index + 1)}
              disabled={index === allSuggestions.length - 1}
              className={navArrowClass}
              aria-label="Next suggestion"
              title="Next (→ arrow key)"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className={css((t) => ({ marginBottom: t.spacing(5) }))}>
        <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), flexWrap: "wrap", marginBottom: t.spacing(2.5) }))}>
          <span className={kindBadgeClass}>
            {kindInfo.icon} {kindInfo.label}
          </span>
          <span
            className={confPillClass}
            style={{ background: confStyle.bg, color: confStyle.text, border: `1px solid ${confStyle.border}` }}
          >
            {suggestion.confidence} confidence
          </span>
        </div>
        <h1 className={css((t) => ({ fontSize: "1.4rem", fontWeight: "700", lineHeight: "1.3", color: t.colors.text }))}>
          {suggestion.title}
        </h1>
        <p className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, marginTop: t.spacing(1.5), fontStyle: "italic" }))}>
          {kindInfo.desc}
        </p>
      </div>

      {/* Divider */}
      <hr className={css((t) => ({ border: "none", borderTop: `1px solid ${t.colors.borderLight}`, marginBottom: t.spacing(5) }))} />

      {/* Body sections */}
      <DetailSection label="Rationale">
        <p className={css({ fontSize: "0.92rem", lineHeight: "1.7" })}>{suggestion.rationale}</p>
      </DetailSection>

      {resolvedMessages && resolvedMessages.length > 0 && (
        <DetailSection label={`Affected Messages (${resolvedMessages.length})`}>
          <div className={css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }))}>
            {resolvedMessages.map((msg) => (
              <div
                key={msg.id}
                className={css((t) => ({
                  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                  background: t.colors.bgAlt,
                  borderRadius: t.radiusSm,
                  border: `1px solid ${t.colors.borderLight}`,
                  fontSize: "0.85rem",
                }))}
              >
                <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.spacing(2) }))}>
                  <span className={css({ fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 })}>
                    {msg.from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? msg.from}
                  </span>
                  <span className={css((t) => ({ fontSize: "0.75rem", color: t.colors.textMuted, flexShrink: 0 }))}>
                    {new Date(msg.date).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className={css((t) => ({ fontWeight: "500", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))}>
                  {msg.subject}
                </div>
                <div className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.8rem", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))}>
                  {msg.snippet}
                </div>
              </div>
            ))}
          </div>
          {suggestion.messageIds && suggestion.messageIds.length > resolvedMessages.length && (
            <p className={css((t) => ({ fontSize: "0.8rem", color: t.colors.textMuted, marginTop: t.spacing(2) }))}>
              + {suggestion.messageIds.length - resolvedMessages.length} message{suggestion.messageIds.length - resolvedMessages.length !== 1 ? "s" : ""} not in current inbox view
            </p>
          )}
        </DetailSection>
      )}

      {suggestion.messageIds && suggestion.messageIds.length > 0 && (!resolvedMessages || resolvedMessages.length === 0) && (
        <DetailSection label={`Message IDs (${suggestion.messageIds.length})`}>
          <div className={css((t) => ({ fontFamily: "monospace", fontSize: "0.8rem", color: t.colors.textMuted, lineHeight: "1.7", wordBreak: "break-all" }))}>
            {suggestion.messageIds.join(", ")}
          </div>
        </DetailSection>
      )}

      {suggestion.filterDraft && (
        <DetailSection label="Filter Draft">
          <div
            className={css((t) => ({
              padding: t.spacing(3),
              background: t.colors.bgAlt,
              borderRadius: t.radiusSm,
              border: `1px solid ${t.colors.borderLight}`,
              fontFamily: "monospace",
              fontSize: "0.84rem",
              lineHeight: "1.7",
            }))}
          >
            {suggestion.filterDraft.from && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>from:</span> {suggestion.filterDraft.from}</div>}
            {suggestion.filterDraft.subjectContains && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>subject contains:</span> {suggestion.filterDraft.subjectContains}</div>}
            {suggestion.filterDraft.hasWords && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>has words:</span> {suggestion.filterDraft.hasWords}</div>}
            {suggestion.filterDraft.label && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>label:</span> {suggestion.filterDraft.label}</div>}
            {suggestion.filterDraft.archive !== undefined && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>archive:</span> {suggestion.filterDraft.archive ? "yes" : "no"}</div>}
          </div>
        </DetailSection>
      )}

      {suggestion.questions && suggestion.questions.length > 0 && (
        <DetailSection label="Questions for You">
          <ul className={css((t) => ({ paddingLeft: t.spacing(5), fontSize: "0.9rem", lineHeight: "1.7" }))}>
            {suggestion.questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </DetailSection>
      )}

      {lastRunAt && (
        <DetailSection label="Run Metadata">
          <div className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, lineHeight: "1.6" }))}>
            <div>Generated: {new Date(lastRunAt).toLocaleString()}</div>
            <div>Kind: {suggestion.kind}</div>
            <div>Confidence: {suggestion.confidence}</div>
          </div>
        </DetailSection>
      )}

      {/* Revised Suggestion Banner */}
      {latestRevision && (
        <div className={css((t) => ({
          marginTop: t.spacing(5),
          padding: t.spacing(4),
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: t.radius,
        }))}>
          <div className={css((t) => ({
            display: "flex",
            alignItems: "center",
            gap: t.spacing(2),
            marginBottom: t.spacing(2),
          }))}>
            <span style={{ fontSize: "1.1rem" }}>🔄</span>
            <span className={css({ fontWeight: "700", fontSize: "0.9rem", color: "#1e40af" })}>
              Revised Suggestion (v{latestRevision.revisionIndex + 1})
            </span>
            {latestRevision.suggestion.kind !== suggestion.kind && (
              <span className={css({
                fontSize: "0.72rem",
                fontWeight: "700",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: "999px",
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
              })}>
                Action changed: {KIND_LABELS[latestRevision.suggestion.kind]?.label ?? latestRevision.suggestion.kind}
              </span>
            )}
          </div>
          <div className={css((t) => ({ fontSize: "0.9rem", fontWeight: "600", marginBottom: t.spacing(1), color: t.colors.text }))}>
            {latestRevision.suggestion.title}
          </div>
          <div className={css((t) => ({ fontSize: "0.85rem", lineHeight: "1.6", color: t.colors.textMuted }))}>
            {latestRevision.suggestion.rationale}
          </div>
        </div>
      )}

      {/* Chat Panel */}
      <div className={css((t) => ({
        marginTop: t.spacing(5),
        border: `1px solid ${t.colors.border}`,
        borderRadius: t.radius,
        overflow: "hidden",
      }))}>
        {/* Chat header */}
        <div className={css((t) => ({
          padding: `${t.spacing(3)} ${t.spacing(4)}`,
          background: t.colors.bgAlt,
          borderBottom: `1px solid ${t.colors.borderLight}`,
          fontWeight: "700",
          fontSize: "0.9rem",
          display: "flex",
          alignItems: "center",
          gap: t.spacing(2),
        }))}>
          <span>💬</span>
          <span>Discuss this suggestion</span>
          {chatMessages.length > 0 && (
            <span className={css((t) => ({
              fontSize: "0.72rem",
              color: t.colors.textMuted,
              fontWeight: "500",
            }))}>
              ({chatMessages.length} message{chatMessages.length !== 1 ? "s" : ""})
            </span>
          )}
        </div>

        {/* Messages */}
        <div className={css((t) => ({
          maxHeight: "400px",
          overflowY: "auto",
          padding: t.spacing(3),
          display: "flex",
          flexDirection: "column",
          gap: t.spacing(2.5),
          scrollbarWidth: "thin",
          scrollbarColor: "#d1d5db transparent",
        }))}>
          {chatInitLoading && (
            <div className={css((t) => ({ textAlign: "center", color: t.colors.textMuted, fontSize: "0.85rem", padding: t.spacing(4) }))}>
              Loading chat…
            </div>
          )}

          {!chatInitLoading && chatMessages.length === 0 && (
            <div className={css((t) => ({ textAlign: "center", color: t.colors.textMuted, fontSize: "0.85rem", padding: t.spacing(4), lineHeight: "1.6" }))}>
              No messages yet. Ask a question or suggest changes to refine this suggestion.
            </div>
          )}

          {chatMessages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}

          {chatLoading && (
            <div className={css((t) => ({ display: "flex", alignItems: "flex-start" }))}>
              <div className={css((t) => ({
                padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
                background: t.colors.bgAlt,
                border: `1px solid ${t.colors.borderLight}`,
                borderRadius: "12px",
                borderBottomLeftRadius: "4px",
                fontSize: "0.88rem",
                color: t.colors.textMuted,
              }))}>
                Thinking…
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat error */}
        {chatError && (
          <div className={css((t) => ({
            padding: `${t.spacing(2)} ${t.spacing(4)}`,
            background: "#fef2f2",
            color: t.colors.error,
            fontSize: "0.82rem",
            borderTop: `1px solid ${t.colors.borderLight}`,
          }))}>
            {chatError}
          </div>
        )}

        {/* Input area */}
        <div className={css((t) => ({
          display: "flex",
          gap: t.spacing(2),
          padding: t.spacing(3),
          borderTop: `1px solid ${t.colors.borderLight}`,
          background: t.colors.bg,
        }))}>
          <textarea
            ref={chatInputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
              }
            }}
            placeholder="Ask a question or suggest changes…"
            rows={1}
            disabled={chatLoading}
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
            onClick={sendChatMessage}
            disabled={chatLoading || !chatInput.trim()}
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

      {/* Action bar */}
      <div
        className={css((t) => ({
          marginTop: t.spacing(6),
          paddingTop: t.spacing(5),
          borderTop: `1px solid ${t.colors.borderLight}`,
          display: "flex",
          alignItems: "center",
          gap: t.spacing(2),
          flexWrap: "wrap",
        }))}
      >
        <button
          onClick={() => setIsReviewed((v) => !v)}
          className={css((t) => ({
            padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
            border: `1px solid ${t.colors.border}`,
            borderRadius: t.radiusSm,
            background: "transparent",
            color: t.colors.text,
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: "600",
            transition: "all 0.15s",
            "&:hover": { background: t.colors.bgAlt },
          }))}
          style={isReviewed ? { borderColor: "#10b981", background: "#ecfdf5", color: "#10b981" } : undefined}
        >
          {isReviewed ? "✓ Reviewed" : "Mark reviewed"}
        </button>

        {isExecutable && (
          <button
            onClick={() => setShowApprovalModal(true)}
            className={css((t) => ({
              padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
              border: "none",
              borderRadius: t.radiusSm,
              background: "#dc2626",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "700",
              transition: "background 0.15s",
              "&:hover": { background: "#b91c1c" },
            }))}
            title="Execute this action (requires confirmation)"
          >
            ⚡ Execute
          </button>
        )}

        {suggestion.kind === "needs_user_input" && (
          <button
            onClick={() => setToastMsg("✏️ Draft response — coming soon!")}
            className={css((t) => ({
              padding: `${t.spacing(2.5)} ${t.spacing(4)}`,
              border: `1px solid ${t.colors.primary}`,
              borderRadius: t.radiusSm,
              background: "transparent",
              color: t.colors.primary,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "600",
              transition: "background 0.15s",
              "&:hover": { background: "rgba(37,99,235,0.06)" },
            }))}
          >
            Draft response
          </button>
        )}
      </div>

      {/* Approval modal */}
      {showApprovalModal && (
        <ApprovalConfirmModal
          suggestion={suggestion}
          messageMap={messageMap}
          onClose={() => setShowApprovalModal(false)}
          onSuccess={(msg) => {
            setShowApprovalModal(false);
            setToastMsg(msg);
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  );
}

// --- Skeleton for loading state ---
function DetailPageSkeleton() {
  return (
    <div className={css((t) => ({ maxWidth: "720px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(5)}` }))}>
      <div className={css({ width: "140px", height: "14px", borderRadius: "4px", background: "#e5e7eb", marginBottom: "24px" })} />
      <div className={css({ display: "flex", gap: "8px", marginBottom: "16px" })}>
        <div className={shimmerClass} style={{ width: "80px", height: "20px" }} />
        <div className={shimmerClass} style={{ width: "110px", height: "20px" }} />
      </div>
      <div className={shimmerClass} style={{ width: "85%", height: "22px", marginBottom: "12px" }} />
      <div className={shimmerClass} style={{ width: "60%", height: "14px", marginBottom: "32px" }} />
      <div className={shimmerClass} style={{ width: "100%", height: "60px", marginBottom: "20px" }} />
      <div className={shimmerClass} style={{ width: "100%", height: "80px", marginBottom: "20px" }} />
      <div className={shimmerClass} style={{ width: "70%", height: "40px" }} />
    </div>
  );
}

// --- Chat bubble component (avoids runtime vars in css()) ---
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

function ChatBubble({ msg }: { msg: ChatMessageData }) {
  const isUser = msg.role === "user";
  return (
    <div className={isUser ? chatRowUserClass : chatRowAssistantClass}>
      <div className={isUser ? chatBubbleUserClass : chatBubbleAssistantClass}>
        {msg.content}
      </div>
      <span className={chatMetaClass}>
        {isUser ? "You" : "Mailania"} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

// --- Shared styles ---
const shimmerClass = css({
  borderRadius: "6px",
  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
  backgroundSize: "200px 100%",
  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
});

const backBtnClass = css((t) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: t.spacing(1),
  padding: `${t.spacing(2)} ${t.spacing(3)}`,
  border: `1px solid ${t.colors.border}`,
  borderRadius: t.radiusSm,
  background: t.colors.bg,
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: "500",
  color: t.colors.text,
  transition: "background 0.15s, border-color 0.15s",
  textDecoration: "none",
  "&:hover": {
    background: t.colors.bgAlt,
    borderColor: t.colors.primary,
    color: t.colors.primary,
  },
  "&:focus-visible": {
    outline: `2px solid ${t.colors.primary}`,
    outlineOffset: "2px",
  },
}));

const navArrowClass = css((t) => ({
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${t.colors.border}`,
  borderRadius: t.radiusSm,
  background: t.colors.bg,
  cursor: "pointer",
  fontSize: "1.1rem",
  fontWeight: "600",
  color: t.colors.text,
  transition: "all 0.15s",
  "&:hover:not(:disabled)": {
    background: t.colors.bgAlt,
    borderColor: t.colors.primary,
  },
  "&:disabled": {
    opacity: 0.3,
    cursor: "not-allowed",
  },
  "&:focus-visible": {
    outline: `2px solid ${t.colors.primary}`,
    outlineOffset: "2px",
  },
}));

const kindBadgeClass = css((t) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: t.spacing(1),
  fontSize: "0.75rem",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: t.colors.textMuted,
}));

const confPillClass = css({
  fontSize: "0.72rem",
  fontWeight: "700",
  textTransform: "uppercase",
  padding: "2px 10px",
  borderRadius: "999px",
  letterSpacing: "0.02em",
});
