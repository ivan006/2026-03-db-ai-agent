// ── IA Orchestrator ───────────────────────────────────────────────
// Manages the read → act → reply loop between Claude and Supabase.
// Schema automatically extracted from src/schema.ts at build time.
// Accepts an optional personality string injected into the system prompt.
//
// Two-model strategy:
//   Haiku  — tool planning (deciding which tools to call, low token cost)
//   Sonnet — final reply to user (natural language, personality, reasoning)

import type { ChatModelAdapter } from "@assistant-ui/react";
import { fetchClaude, buildSystemPrompt } from "./anthropic";
import { buildToolsFromSchema, executeTool } from "./supabase";

const MODEL_PLANNER = "claude-haiku-4-5-20251001"; // tool selection — fast, cheap
const MODEL_RESPONDER = "claude-sonnet-4-5"; // final reply — full quality

export function createIAModelAdapter(personality: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const tools = buildToolsFromSchema();
      const systemPrompt = buildSystemPrompt(tools, personality);

      const formattedMessages = messages.map((m) => ({
        role: m.role,
        content: m.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" "),
      }));

      // Haiku decides which tools to call — low token cost
      const data = await fetchClaude(
        {
          model: MODEL_PLANNER,
          max_tokens: 400,
          system: systemPrompt,
          tools,
          messages: formattedMessages,
        },
        abortSignal,
      );

      if (data.stop_reason === "tool_use") {
        const toolUseBlocks = data.content.filter(
          (b: any) => b.type === "tool_use",
        );

        if (toolUseBlocks.length > 0) {
          yield {
            content: [
              { type: "text" as const, text: `_Working on it..._\n\n` },
            ],
          };

          // Execute all tool calls in parallel
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (block: any) => {
              const result = await executeTool(block.name, block.input);
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: result,
              };
            }),
          );

          // Sonnet composes the final reply with full reasoning and personality
          const followUpData = await fetchClaude(
            {
              model: MODEL_RESPONDER,
              max_tokens: 1000,
              system: systemPrompt,
              tools,
              messages: [
                ...formattedMessages,
                { role: "assistant", content: data.content },
                {
                  role: "user",
                  content: toolResults,
                },
              ],
            },
            abortSignal,
          );

          const text = followUpData.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("");

          yield { content: [{ type: "text" as const, text }] };
        }
      } else {
        // No tools needed — Haiku already has the answer, but re-ask Sonnet
        // so personality and response quality are consistent across all paths.
        const replyData = await fetchClaude(
          {
            model: MODEL_RESPONDER,
            max_tokens: 1000,
            system: systemPrompt,
            messages: formattedMessages,
          },
          abortSignal,
        );

        const text = replyData.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        yield { content: [{ type: "text" as const, text }] };
      }
    },
  };
}
