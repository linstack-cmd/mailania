import { useState, useEffect, useCallback } from "react";
import { css } from "@flow-css/core/css";
import { useParams, useLocation } from "wouter";
import {
  KIND_LABELS,
  CONFIDENCE_STYLES,
  DetailSection,
  ApprovalConfirmModal,
  Toast,
  type TriageSuggestion,
  type ActionPlanStep,
  type InboxMessage,
} from "./TriageSuggestions";
import { ChatPanel, type ChatMessageData } from "./ChatPanel";

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
        throw new Error(errData.detail || errData.error || "Failed to send message");
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

  // Use the latest revision as the "active" suggestion when available
  const activeSuggestion: TriageSuggestion = latestRevision?.suggestion ?? suggestion;
  const isRevised = latestRevision !== null;

  const kindInfo = KIND_LABELS[activeSuggestion.kind];
  const confStyle = CONFIDENCE_STYLES[activeSuggestion.confidence] ?? CONFIDENCE_STYLES.low;
  const isExecutable = activeSuggestion.kind === "archive_bulk" || activeSuggestion.kind === "create_filter";

  const resolvedMessages = activeSuggestion.messageIds
    ?.map((id) => messageMap.get(id))
    .filter((m): m is InboxMessage => !!m);

  return (
    <div className={css((t) => ({ maxWidth: "720px", margin: "0 auto", padding: `${t.spacing(6)} ${t.spacing(5)} calc(${t.spacing(10)} + env(safe-area-inset-bottom, 0px))`, minWidth: 0, boxSizing: "border-box", overflowX: "hidden", "@media (max-width: 640px)": { padding: `${t.spacing(4)} ${t.spacing(3)} calc(${t.spacing(9)} + env(safe-area-inset-bottom, 0px))` } }))}>
      {/* Back + nav bar */}
      <div className={css((t) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.spacing(3), marginBottom: t.spacing(5), flexWrap: "wrap", minWidth: 0, "@media (max-width: 480px)": { marginBottom: t.spacing(4) } }))}>
        <button onClick={() => navigate("/")} className={backBtnClass}>
          ← Back to Triage
        </button>
        {allSuggestions.length > 1 && (
          <div className={css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(2), flexWrap: "wrap" }))}>
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
            {activeSuggestion.confidence} confidence
          </span>
        </div>
        <h1 className={css((t) => ({ fontSize: "1.4rem", fontWeight: "700", lineHeight: "1.3", color: t.colors.text, overflowWrap: "anywhere", "@media (max-width: 480px)": { fontSize: "1.25rem" } }))}>
          {activeSuggestion.title}
        </h1>
        <p className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, marginTop: t.spacing(1.5), fontStyle: "italic" }))}>
          {kindInfo.desc}
        </p>
        {isRevised && (
          <div className={css((t) => ({
            display: "inline-flex",
            alignItems: "center",
            gap: t.spacing(1),
            marginTop: t.spacing(2),
            padding: `${t.spacing(1)} ${t.spacing(2.5)}`,
            background: "#eef2ff",
            border: "1px solid #bfdbfe",
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: "600",
            color: "#1e40af",
          }))}>
            🔄 Revised (v{latestRevision!.revisionIndex + 1}) via chat
          </div>
        )}
      </div>

      {/* Divider */}
      <hr className={css((t) => ({ border: "none", borderTop: `1px solid ${t.colors.borderLight}`, marginBottom: t.spacing(5) }))} />

      {/* Body sections */}
      <DetailSection label="Rationale">
        <p className={css({ fontSize: "0.92rem", lineHeight: "1.7" })}>{activeSuggestion.rationale}</p>
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
                <div className={css((t) => ({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: t.spacing(2), minWidth: 0, "@media (max-width: 480px)": { flexDirection: "column", alignItems: "flex-start", gap: t.spacing(0.5) } }))}>
                  <span className={css({ fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, maxWidth: "100%", "@media (max-width: 480px)": { whiteSpace: "normal", overflowWrap: "anywhere" } })}>
                    {msg.from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? msg.from}
                  </span>
                  <span className={css((t) => ({ fontSize: "0.75rem", color: t.colors.textMuted, flexShrink: 0 }))}>
                    {new Date(msg.date).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className={css((t) => ({ fontWeight: "500", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", "@media (max-width: 640px)": { whiteSpace: "normal", display: "-webkit-box", "-webkit-line-clamp": 2, "-webkit-box-orient": "vertical", overflowWrap: "anywhere" } }))}>
                  {msg.subject}
                </div>
                <div className={css((t) => ({ color: t.colors.textMuted, fontSize: "0.8rem", marginTop: t.spacing(1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", "@media (max-width: 640px)": { whiteSpace: "normal", display: "-webkit-box", "-webkit-line-clamp": 2, "-webkit-box-orient": "vertical", overflowWrap: "anywhere" } }))}>
                  {msg.snippet}
                </div>
              </div>
            ))}
          </div>
          {activeSuggestion.messageIds && activeSuggestion.messageIds.length > resolvedMessages.length && (
            <p className={css((t) => ({ fontSize: "0.8rem", color: t.colors.textMuted, marginTop: t.spacing(2) }))}>
              + {activeSuggestion.messageIds.length - resolvedMessages.length} message{activeSuggestion.messageIds.length - resolvedMessages.length !== 1 ? "s" : ""} not in current inbox view
            </p>
          )}
        </DetailSection>
      )}

      {activeSuggestion.messageIds && activeSuggestion.messageIds.length > 0 && (!resolvedMessages || resolvedMessages.length === 0) && (
        <DetailSection label={`Message IDs (${activeSuggestion.messageIds.length})`}>
          <div className={css((t) => ({ fontFamily: "monospace", fontSize: "0.8rem", color: t.colors.textMuted, lineHeight: "1.7", wordBreak: "break-all" }))}>
            {activeSuggestion.messageIds.join(", ")}
          </div>
        </DetailSection>
      )}

      {activeSuggestion.filterDraft && (
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
            {activeSuggestion.filterDraft.from && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>from:</span> {activeSuggestion.filterDraft.from}</div>}
            {activeSuggestion.filterDraft.subjectContains && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>subject contains:</span> {activeSuggestion.filterDraft.subjectContains}</div>}
            {activeSuggestion.filterDraft.hasWords && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>has words:</span> {activeSuggestion.filterDraft.hasWords}</div>}
            {activeSuggestion.filterDraft.label && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>label:</span> {activeSuggestion.filterDraft.label}</div>}
            {activeSuggestion.filterDraft.archive !== undefined && <div><span className={css((t) => ({ color: t.colors.textMuted }))}>archive:</span> {activeSuggestion.filterDraft.archive ? "yes" : "no"}</div>}
          </div>
        </DetailSection>
      )}

      {activeSuggestion.actionPlan && activeSuggestion.actionPlan.length > 0 && (
        <ActionPlanSection steps={activeSuggestion.actionPlan} />
      )}

      {activeSuggestion.questions && activeSuggestion.questions.length > 0 && (
        <DetailSection label="Questions for You">
          <ul className={css((t) => ({ paddingLeft: t.spacing(5), fontSize: "0.9rem", lineHeight: "1.7" }))}>
            {activeSuggestion.questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </DetailSection>
      )}

      {lastRunAt && (
        <DetailSection label="Run Metadata">
          <div className={css((t) => ({ fontSize: "0.82rem", color: t.colors.textMuted, lineHeight: "1.6" }))}>
            <div>Generated: {new Date(lastRunAt).toLocaleString()}</div>
            <div>Kind: {activeSuggestion.kind}</div>
            <div>Confidence: {activeSuggestion.confidence}</div>
          </div>
        </DetailSection>
      )}

      {/* Chat Panel */}
      <div className={css((t) => ({ marginTop: t.spacing(5) }))}>
        <ChatPanel
          title="Discuss this suggestion"
          subtitle="Ask questions, refine the recommendation, or explore related emails without executing anything."
          messages={chatMessages}
          loading={chatLoading}
          initLoading={chatInitLoading}
          error={chatError}
          input={chatInput}
          onInputChange={setChatInput}
          onSend={sendChatMessage}
          placeholder="Ask a question or suggest changes…"
          emptyState="No messages yet. Ask a question or suggest changes to refine this suggestion."
        />
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
          minWidth: 0,
          "@media (max-width: 640px)": {
            alignItems: "stretch",
          },
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
            ⚡ Execute{isRevised ? " (revised)" : ""}
          </button>
        )}

        {activeSuggestion.kind === "needs_user_input" && (
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
          suggestion={activeSuggestion}
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

// --- Action Plan Section ---
const STEP_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  archive_bulk: { icon: "📦", label: "Archive" },
  create_filter: { icon: "🔀", label: "Create Filter" },
  mark_read: { icon: "👁️", label: "Mark Read" },
  label_messages: { icon: "🏷️", label: "Label" },
  needs_user_input: { icon: "❓", label: "Needs Input" },
};

// Pre-computed styles to avoid runtime variables in css() (Flow CSS constraint)
const actionPlanGapClass = css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(2) }));
const actionPlanGapCompactClass = css((t) => ({ display: "flex", flexDirection: "column", gap: t.spacing(1.5) }));

const stepCardClass = css((t) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: t.spacing(2.5),
  padding: `${t.spacing(2.5)} ${t.spacing(3)}`,
  background: t.colors.bgAlt,
  borderRadius: t.radiusSm,
  border: `1px solid ${t.colors.borderLight}`,
  fontSize: "0.88rem",
}));

const stepCardCompactClass = css((t) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: t.spacing(2.5),
  padding: `${t.spacing(2)} ${t.spacing(2.5)}`,
  background: t.colors.bgAlt,
  borderRadius: t.radiusSm,
  border: `1px solid ${t.colors.borderLight}`,
  fontSize: "0.82rem",
}));

const stepCircleClass = css((t) => ({
  flexShrink: 0,
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  background: t.colors.primary,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.75rem",
  fontWeight: "700",
  marginTop: "1px",
}));

const stepCircleCompactClass = css((t) => ({
  flexShrink: 0,
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  background: t.colors.primary,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.7rem",
  fontWeight: "700",
  marginTop: "1px",
}));

const stepBodyClass = css({ flex: 1, minWidth: 0 });
const stepHeaderClass = css((t) => ({ display: "flex", alignItems: "center", gap: t.spacing(1.5), flexWrap: "wrap" }));
const stepLabelClass = css({ fontWeight: "600" });
const stepLabelPillClass = css({
  fontSize: "0.72rem",
  padding: "1px 8px",
  borderRadius: "999px",
  background: "#eef2ff",
  color: "#1e40af",
  border: "1px solid #bfdbfe",
  fontWeight: "600",
});
const stepRationaleClass = css((t) => ({ color: t.colors.textMuted, marginTop: t.spacing(0.5), lineHeight: "1.5" }));

function ActionPlanSection({ steps, compact }: { steps: ActionPlanStep[]; compact?: boolean }) {
  return (
    <DetailSection label={`Action Plan (${steps.length} step${steps.length !== 1 ? "s" : ""})`}>
      <div className={compact ? actionPlanGapCompactClass : actionPlanGapClass}>
        {steps.map((step, i) => {
          const typeInfo = STEP_TYPE_LABELS[step.type] ?? { icon: "⚙️", label: step.type };
          return (
            <div key={i} className={compact ? stepCardCompactClass : stepCardClass}>
              <div className={compact ? stepCircleCompactClass : stepCircleClass}>
                {i + 1}
              </div>
              <div className={stepBodyClass}>
                <div className={stepHeaderClass}>
                  <span className={stepLabelClass}>
                    {typeInfo.icon} {typeInfo.label}
                  </span>
                  {step.params && step.type === "label_messages" && (step.params as any).label && (
                    <span className={stepLabelPillClass}>
                      {(step.params as any).label}
                    </span>
                  )}
                </div>
                {step.rationale && (
                  <div className={stepRationaleClass}>
                    {step.rationale}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DetailSection>
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
