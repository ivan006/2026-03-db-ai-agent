// ── IA Orchestrator ───────────────────────────────────────────────
// Strict two-phase architecture:
//   Phase 1 — Haiku loops with tools until it has all the data
//   Phase 2 — Sonnet gets all context and writes the reply (no tools)
//
// Process log:
//   🤔 Solving x   — Haiku planning/replanning
//   📦 Fetching x  — Supabase data call
//   💬 ...         — Sonnet composing (always last, always once)

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

      let accumulatedText = "";
      const step = (line: string) => {
        accumulatedText += line + "\n";
        return accumulatedText;
      };

      // ── Phase 1: Haiku planning loop ──────────────────────────────
      const userText =
        (messages[messages.length - 1]?.content as any[])?.[0]?.text ??
        "your request";
      yield {
        content: [
          {
            type: "text" as const,
            text: step(`- 🤔 Solving "${userText}"...`),
          },
        ],
      };

      let plannerMessages = [...formattedMessages];
      let allToolResults: any[] = [];
      let isFirst = true;

      while (true) {
        const planData = await fetchClaude(
          {
            model: MODEL_PLANNER,
            max_tokens: 400,
            system: systemPrompt,
            tools,
            messages: plannerMessages,
          },
          abortSignal,
        );

        if (planData.error) {
          yield {
            content: [
              {
                type: "text" as const,
                text: step(
                  `- ⚠️ ${planData.error.message ?? "something went wrong"}. Please try again.`,
                ),
              },
            ],
          };
          return;
        }

        if (planData.stop_reason === "tool_use") {
          const toolUseBlocks = planData.content.filter(
            (b: any) => b.type === "tool_use",
          );

          // Show fetching steps
          const fetchStep = toolUseBlocks
            .map((b: any) => {
              const table = b.name.split("_").slice(1).join(" ");
              return `- 📦 Fetching ${table}...`;
            })
            .join("\n");
          yield { content: [{ type: "text" as const, text: step(fetchStep) }] };

          // Execute all tools
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
                _error: parsed?.error || parsed?.code ? true : false,
              };
            }),
          );

          for (const r of toolResults) {
            if (r._error) {
              yield {
                content: [
                  {
                    type: "text" as const,
                    text: step(
                      "- ⚠️ Hmm, that didn't quite work. Let me try a different approach...",
                    ),
                  },
                ],
              };
            }
          }

          // Accumulate context for Sonnet
          allToolResults.push({
            assistantMsg: { role: "assistant", content: planData.content },
            userMsg: {
              role: "user",
              content: toolResults.map(({ _name, _error, ...rest }) => rest),
            },
          });

          // Continue Haiku loop with updated context
          plannerMessages = [
            ...plannerMessages,
            { role: "assistant", content: planData.content },
            {
              role: "user",
              content: toolResults.map(({ _name, _error, ...rest }) => rest),
            },
          ];

          // If more solving needed, show step
          if (!isFirst) {
            yield {
              content: [
                {
                  type: "text" as const,
                  text: step("- 🤔 Solving further..."),
                },
              ],
            };
          }
          isFirst = false;
        } else {
          // Haiku is done — break out of planning loop
          break;
        }
      }

      // ── Phase 2: Sonnet reply (no tools) ─────────────────────────
      yield {
        content: [
          {
            type: "text" as const,
            text: step("- 💬 How can I put this together..."),
          },
        ],
      };

      // Build full context for Sonnet
      const sonnetMessages: any[] = [...formattedMessages];
      for (const { assistantMsg, userMsg } of allToolResults) {
        sonnetMessages.push(assistantMsg);
        sonnetMessages.push(userMsg);
      }

      const replyData = await fetchClaude(
        {
          model: MODEL_RESPONDER,
          max_tokens: 1000,
          system: systemPrompt,
          // No tools — Sonnet only writes, never fetches
          messages: sonnetMessages,
        },
        abortSignal,
      );

      if (replyData.error) {
        yield {
          content: [
            {
              type: "text" as const,
              text: step(
                `- ⚠️ ${replyData.error.message ?? "something went wrong"}. Please try again.`,
              ),
            },
          ],
        };
        return;
      }

      const text = replyData.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      yield {
        content: [
          { type: "text" as const, text: `${accumulatedText}\n---\n\n${text}` },
        ],
      };
    },
  };
}
