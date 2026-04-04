import type Anthropic from "@anthropic-ai/sdk";

export const EPHEMERAL_CACHE_CONTROL: Anthropic.CacheControlEphemeral = {
  type: "ephemeral",
};

export function textBlock(
  text: string,
  cached: boolean = false,
): Anthropic.TextBlockParam {
  return cached
    ? {
        type: "text",
        text,
        cache_control: EPHEMERAL_CACHE_CONTROL,
      }
    : {
        type: "text",
        text,
      };
}

export function textMessage(
  role: "user" | "assistant",
  text: string,
  cached: boolean = false,
): Anthropic.MessageParam {
  return {
    role,
    content: [textBlock(text, cached)],
  };
}

export function systemPrompt(
  text: string,
  cached: boolean = true,
): Anthropic.TextBlockParam[] {
  return [textBlock(text, cached)];
}

export function withCacheBreakpoint(
  message: Anthropic.MessageParam,
): Anthropic.MessageParam {
  if (typeof message.content === "string") {
    return textMessage(message.role, message.content, true);
  }

  const content = [...message.content];
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block.type === "text" || block.type === "tool_result") {
      content[i] = {
        ...block,
        cache_control: EPHEMERAL_CACHE_CONTROL,
      };
      return {
        ...message,
        content,
      };
    }
  }

  return message;
}
