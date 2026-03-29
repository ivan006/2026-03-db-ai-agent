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

        // Contextual opening message based on what we're about to do
        const firstStep = toolUseBlocks
          .map((b: any) => {
            const action = b.name.split("_")[0];
            const table = b.name
              .split("_")
              .slice(1)
              .join("_")
              .replace(/_/g, " ");
            return action === "query"
              ? `- Let me see how we can put your ${table} together...`
              : action === "create"
                ? `- Working out how to create that ${table}...`
                : action === "update"
                  ? `- Let me work out those ${table} changes...`
                  : action === "delete"
                    ? `- Working out how to remove that ${table}...`
                    : `- Let me work this out...`;
          })
          .join("\n");

        let accumulatedText = firstStep + "\n";
        yield { content: [{ type: "text" as const, text: firstStep + "\n" }] };

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block: any) => {
            console.log("[IA] executing tool:", block.name, block.input);
            const result = await executeTool(block.name, block.input);
            const parsed = JSON.parse(result);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result,
              _name: block.name,
              _error:
                parsed?.error || parsed?.code
                  ? (parsed.message ?? parsed.error ?? "something went wrong")
                  : null,
            };
          }),
        );

        for (const r of toolResults) {
          if (r._error) {
            const errMsg = `- Hmm, that didn't quite work. Let me try a different approach...\n`;
            yield { content: [{ type: "text" as const, text: errMsg }] };
            accumulatedText += errMsg;
          }
        }

        let followUpMessages: any[] = [
          ...formattedMessages,
          { role: "assistant", content: data.content },
          {
            role: "user",
            content: toolResults.map(({ _name, _error, ...rest }) => rest),
          },
        ];

        let lastResults = toolResults;

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

            // Contextual message: what we found + what we're doing next
            const prevTables = lastResults
              .map((r: any) => r._name.split("_").slice(1).join(" "))
              .join(", ");
            const nextStep = nextToolBlocks
              .map((b: any) => {
                const action = b.name.split("_")[0];
                const table = b.name
                  .split("_")
                  .slice(1)
                  .join("_")
                  .replace(/_/g, " ");
                return action === "query"
                  ? `- Got the ${prevTables}, now working out the ${table}...`
                  : action === "create"
                    ? `- Got the ${prevTables}, working out the ${table} creation...`
                    : action === "update"
                      ? `- Got the ${prevTables}, working out the ${table} changes...`
                      : action === "delete"
                        ? `- Got the ${prevTables}, working out the ${table} removal...`
                        : `- Got the ${prevTables}, let me work this out...`;
              })
              .join("\n");

            yield {
              content: [{ type: "text" as const, text: `${nextStep}\n` }],
            };
            accumulatedText += `${nextStep}\n`;
            const nextResults = await Promise.all(
              nextToolBlocks.map(async (block: any) => {
                console.log("[IA] executing tool:", block.name, block.input);
                const result = await executeTool(block.name, block.input);
                const parsed = JSON.parse(result);
                return {
                  type: "tool_result" as const,
                  tool_use_id: block.id,
                  content: result,
                  _name: block.name,
                  _error:
                    parsed?.error || parsed?.code
                      ? (parsed.message ??
                        parsed.error ??
                        "something went wrong")
                      : null,
                };
              }),
            );

            for (const r of nextResults) {
              if (r._error) {
                const errMsg = `- Hmm, that didn't quite work. Let me try a different approach...\n`;
                yield { content: [{ type: "text" as const, text: errMsg }] };
                accumulatedText += errMsg;
              }
            }
            lastResults = nextResults;
            followUpMessages = [
              ...followUpMessages,
              { role: "assistant", content: followUpData.content },
              {
                role: "user",
                content: nextResults.map(({ _name, _error, ...rest }) => rest),
              },
            ];
          } else {
            const text = followUpData.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("");
            yield {
              content: [
                {
                  type: "text" as const,
                  text: `${accumulatedText}\n\n---\n\n${text}`,
                },
              ],
            };
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
