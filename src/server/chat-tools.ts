/**
 * @deprecated Use agent-tools.ts.
 *
 * Kept as a compatibility shim so older imports keep working while Mailania's
 * agent capability surface is centralized in the strict read/recommendation-
 * only registry.
 */

export {
  MAILANIA_AGENT_TOOL_DEFINITIONS as CHAT_TOOL_DEFINITIONS,
  executeAgentTool as executeTool,
  type AgentToolContext,
  type ToolExecResult,
  type ToolTrace,
} from "./agent-tools.js";
