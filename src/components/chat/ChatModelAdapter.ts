// ── IA Orchestrator ───────────────────────────────────────────────
// Manages the read → act → reply loop between Claude and Supabase.
// Loads tools and schema dynamically from the database on each run.
// Accepts an optional personality string injected into the system prompt.

import type { ChatModelAdapter } from "@assistant-ui/react";
import { fetchClaude, buildSystemPrompt } from "./anthropic";
import {
  buildToolsFromPolicies,
  executeTool,
  getTableSchema,
} from "./supabase";

export function createIAModelAdapter(personality: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      // Load tools and schema dynamically from the database
      const [tools, schema] = await Promise.all([
        buildToolsFromPolicies(),
        getTableSchema(),
      ]);

      // System prompt includes capability format + full schema + personality
      const systemPrompt = buildSystemPrompt(tools, schema, personality);

      const formattedMessages = messages.map((m) => ({
        role: m.role,
        content: m.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" "),
      }));

      // First call — Claude decides whether to use a tool or reply directly
      const data = await fetchClaude(
        {
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          system: systemPrompt,
          tools,
          messages: formattedMessages,
        },
        abortSignal,
      );

      // ── read → act → reply loop ───────────────────────────────────
      if (data.stop_reason === "tool_use") {
        const toolUseBlock = data.content.find(
          (b: any) => b.type === "tool_use",
        );

        if (toolUseBlock) {
          yield {
            content: [
              { type: "text" as const, text: `_Working on it..._\n\n` },
            ],
          };

          const toolResult = await executeTool(
            toolUseBlock.name,
            toolUseBlock.input,
          );

          const followUpData = await fetchClaude(
            {
              model: "claude-sonnet-4-5",
              max_tokens: 1000,
              system: systemPrompt,
              tools,
              messages: [
                ...formattedMessages,
                { role: "assistant", content: data.content },
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolUseBlock.id,
                      content: toolResult,
                    },
                  ],
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
        const text = data.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        yield { content: [{ type: "text" as const, text }] };
      }
    },
  };
}
