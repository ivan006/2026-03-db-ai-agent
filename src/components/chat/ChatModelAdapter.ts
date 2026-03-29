// ── IA Orchestrator ───────────────────────────────────────────────
// Manages the read → act → reply loop manually.
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

        // Show user what we're doing
        const toolSummary = toolUseBlocks
          .map((b: any) => {
            const action = b.name.split("_")[0];
            const table = b.name.split("_").slice(1).join("_");
            return action === "query"
              ? `Fetching ${table}...`
              : action === "create"
                ? `Creating ${table}...`
                : action === "update"
                  ? `Updating ${table}...`
                  : action === "delete"
                    ? `Deleting from ${table}...`
                    : `Running ${b.name}...`;
          })
          .join("\n");

        yield {
          content: [{ type: "text" as const, text: `_${toolSummary}_` }],
        };

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block: any) => {
            console.log("[IA] executing tool:", block.name, block.input);
            const result = await executeTool(block.name, block.input);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result,
            };
          }),
        );

        let followUpMessages: any[] = [
          ...formattedMessages,
          { role: "assistant", content: data.content },
          { role: "user", content: toolResults },
        ];

        while (true) {
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
            const nextSummary = nextToolBlocks
              .map((b: any) => {
                const action = b.name.split("_")[0];
                const table = b.name.split("_").slice(1).join("_");
                return action === "query"
                  ? `Fetching ${table}...`
                  : action === "create"
                    ? `Creating ${table}...`
                    : action === "update"
                      ? `Updating ${table}...`
                      : action === "delete"
                        ? `Deleting from ${table}...`
                        : `Running ${b.name}...`;
              })
              .join("\n");
            yield {
              content: [{ type: "text" as const, text: `_${nextSummary}_` }],
            };
            const nextResults = await Promise.all(
              nextToolBlocks.map(async (block: any) => {
                console.log("[IA] executing tool:", block.name, block.input);
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
      } else {
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
