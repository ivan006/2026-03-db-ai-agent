// ── IA Orchestrator ───────────────────────────────────────────────
// Manages the read → act → reply loop between Claude and Supabase.
// Two-model strategy:
//   Haiku  — tool planning (low token cost)
//   Sonnet — final reply (natural language, personality, reasoning)

import type { ChatModelAdapter } from "@assistant-ui/react";
import { fetchClaude, buildSystemPrompt } from "./anthropic";
import { buildToolsFromSchema, executeTool, getSessionUser } from "./supabase";

const MODEL_PLANNER = "claude-haiku-4-5-20251001";
const MODEL_RESPONDER = "claude-sonnet-4-5";

export function createIAModelAdapter(personality: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const tools = buildToolsFromSchema();
      const user = await getSessionUser();
      const systemPrompt = buildSystemPrompt(tools, personality, user);

      const formattedMessages = messages.map((m) => ({
        role: m.role,
        content: (m.content as any[])
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join(" "),
      }));

      // Haiku decides which tools to call
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

      if (data.error) throw new Error(data.error.message ?? "Claude API error");

      if (data.stop_reason === "tool_use") {
        const toolUseBlocks = data.content.filter(
          (b: any) => b.type === "tool_use",
        );

        if (toolUseBlocks.length > 0) {
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

          // Build conversation history for Sonnet
          let followUpMessages: any[] = [
            ...formattedMessages,
            { role: "assistant", content: data.content },
            { role: "user", content: toolResults },
          ];

          // Loop — Sonnet may need to call more tools before replying
          while (true) {
            // Sonnet gets tools so it can chain calls if needed
            const followUpData = await fetchClaude(
              {
                model: MODEL_RESPONDER,
                max_tokens: 1000,
                system: systemPrompt,
                tools,
                messages: followUpMessages,
              },
              abortSignal,
            );

            if (followUpData.error)
              throw new Error(followUpData.error.message ?? "Claude API error");

            if (followUpData.stop_reason === "tool_use") {
              const nextToolBlocks = followUpData.content.filter(
                (b: any) => b.type === "tool_use",
              );
              const nextResults = await Promise.all(
                nextToolBlocks.map(async (block: any) => {
                  const result = await executeTool(block.name, block.input);
                  return {
                    type: "tool_result" as const,
                    tool_use_id: block.id,
                    content: result,
                  };
                }),
              );
              followUpMessages = [
                ...followUpMessages,
                { role: "assistant", content: followUpData.content },
                { role: "user", content: nextResults },
              ];
            } else {
              const text = followUpData.content
                .filter((b: any) => b.type === "text")
                .map((b: any) => b.text)
                .join("");
              yield { content: [{ type: "text" as const, text }] };
              break;
            }
          }
        }
      } else {
        // No tools — Sonnet composes the reply directly
        const replyData = await fetchClaude(
          {
            model: MODEL_RESPONDER,
            max_tokens: 1000,
            system: systemPrompt,
            messages: formattedMessages,
          },
          abortSignal,
        );

        if (replyData.error)
          throw new Error(replyData.error.message ?? "Claude API error");

        const text = replyData.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        yield { content: [{ type: "text" as const, text }] };
      }
    },
  };
}
