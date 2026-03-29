// ── IA Orchestrator ───────────────────────────────────────────────
// Sends messages to Claude and yields content blocks.
// Tool execution and the agentic loop are handled by assistant-ui's
// LocalRuntime — this adapter just translates between formats.
//
// Two-model strategy:
//   Haiku  — tool planning (low token cost)
//   Sonnet — final reply (natural language, personality, reasoning)

import type {
  ChatModelAdapter,
  ChatModelRunOptions,
} from "@assistant-ui/react";
import { fetchClaude, buildSystemPrompt } from "./anthropic";
import { buildToolsFromSchema, getSessionUser } from "./supabase";

const MODEL_PLANNER = "claude-haiku-4-5-20251001";
const MODEL_RESPONDER = "claude-sonnet-4-5";

// Convert assistant-ui messages to Anthropic API format
function toAnthropicMessages(messages: ChatModelRunOptions["messages"]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: (m.content as any[]).map((p: any) => ({
          type: "tool_result",
          tool_use_id: p.toolCallId,
          content:
            typeof p.result === "string" ? p.result : JSON.stringify(p.result),
        })),
      };
    }

    if (m.role === "assistant") {
      const content: any[] = [];
      for (const p of m.content as any[]) {
        if (p.type === "text" && p.text) {
          content.push({ type: "text", text: p.text });
        } else if (p.type === "tool-call") {
          content.push({
            type: "tool_use",
            id: p.toolCallId,
            name: p.toolName,
            input: p.args ?? {},
          });
        }
      }
      return { role: "assistant" as const, content };
    }

    return {
      role: "user" as const,
      content: (m.content as any[])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" "),
    };
  });
}

export function createIAModelAdapter(personality: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const tools = buildToolsFromSchema();
      const user = await getSessionUser();
      const systemPrompt = buildSystemPrompt(tools, personality, user);
      const anthropicMessages = toAnthropicMessages(messages);

      // Haiku for planning, Sonnet for replies after tool results
      const lastMessage = messages[messages.length - 1];
      const isFollowUp = lastMessage?.role === "tool";
      const model = isFollowUp ? MODEL_RESPONDER : MODEL_PLANNER;
      const maxTokens = isFollowUp ? 1000 : 400;

      const data = await fetchClaude(
        {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          tools,
          messages: anthropicMessages,
        },
        abortSignal,
      );

      if (data.error) throw new Error(data.error.message ?? "Claude API error");

      const content: any[] = [];
      for (const block of data.content ?? []) {
        if (block.type === "text" && block.text) {
          content.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          content.push({
            type: "tool-call",
            toolCallId: block.id,
            toolName: block.name,
            args: block.input ?? {},
          });
        }
      }

      const hasToolCalls = content.some((c: any) => c.type === "tool-call");

      yield {
        content,
        status: hasToolCalls
          ? { type: "requires-action" as const, reason: "tool-calls" as const }
          : { type: "complete" as const, reason: "stop" as const },
      };
    },
  };
}
