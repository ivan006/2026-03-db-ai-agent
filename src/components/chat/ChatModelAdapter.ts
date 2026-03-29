// ── IA Orchestrator ───────────────────────────────────────────────
// Strict two-phase architecture:
//   Phase 1 — Haiku loops with tools until it has all the data
//   Phase 2 — Sonnet gets all context and writes the reply (no tools)
//
// Process log:
//   🤔 Thinking   — Haiku planning/replanning
//   📦 Fetching x  — Supabase data call
//   💬 ...         — Sonnet composing (always last, always once)

import type { ChatModelAdapter } from "@assistant-ui/react";
import {
  fetchClaude,
  buildPlannerPrompt,
  buildResponderPrompt,
} from "./anthropic";
import { buildToolsFromSchema, executeTool, getSessionUser } from "./supabase";

const MODEL_PLANNER = "claude-haiku-4-5-20251001";
const MODEL_RESPONDER = "claude-sonnet-4-5";

export function createIAModelAdapter(personality: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const tools = buildToolsFromSchema();
      const user = await getSessionUser();
      const plannerPrompt = buildPlannerPrompt(user);
      const responderPrompt = buildResponderPrompt(tools, personality, user);

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
      yield {
        content: [{ type: "text" as const, text: step(`- 🤔 Uhhh...`) }],
      };

      let plannerMessages = [...formattedMessages];
      let allToolResults: any[] = [];
      let isFirstRound = true;

      while (true) {
        const planData = await fetchClaude(
          {
            model: MODEL_PLANNER,
            max_tokens: 400,
            system: plannerPrompt,
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
          const textBlock = planData.content.find(
            (b: any) => b.type === "text" && b.text,
          );

          // Use Haiku's own description as the fetch group label
          const fetchLabel = textBlock?.text
            ? `- 📦 ${textBlock.text}`
            : toolUseBlocks
                .map(
                  (b: any) =>
                    `- 📦 Fetching ${b.name.split("_").slice(1).join(" ")}...`,
                )
                .join("\n");
          yield {
            content: [{ type: "text" as const, text: step(fetchLabel) }],
          };

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

          isFirstRound = false;

          // Subsequent rounds say Hmmm
          yield {
            content: [{ type: "text" as const, text: step(`- 🤔 Hmmm...`) }],
          };
        } else {
          // Haiku returned text — if it's a short label that's fine, if it's a full reply pass to Sonnet
          const haikuText =
            planData.content.find((b: any) => b.type === "text")?.text ?? "";
          if (haikuText.length > 100) {
            plannerMessages = [
              ...plannerMessages,
              { role: "assistant", content: planData.content },
            ];
          }
          break;
        }
      }

      // ── Phase 2: Sonnet reply (no tools) ─────────────────────────
      yield {
        content: [{ type: "text" as const, text: step("- 💬 Ummm...") }],
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
          system: responderPrompt,
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
          { type: "text" as const, text: `${accumulatedText}\n\n\n${text}` },
        ],
      };
    },
  };
}
