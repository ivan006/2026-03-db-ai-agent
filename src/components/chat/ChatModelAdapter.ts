// ── IA Orchestrator ───────────────────────────────────────────────
// Manages the read → act → reply loop manually.
// Two-model strategy:
//   Haiku  — tool planning (low token cost)
//   Sonnet — final reply (natural language, personality, reasoning)
//
// Process log step types:
//   🤔 Planning   — Haiku deciding what to do
//   📦 Data       — Supabase request in flight
//   💬 Composing  — Sonnet writing the final reply
//   ⚠️  Oopsie    — something went wrong, retrying

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

      // ── Planning call ─────────────────────────────────────────────
      accumulatedText = `- 🤔 Solving "${(messages[messages.length - 1]?.content as any[])?.[0]?.text ?? "your request"}"...\n`;
      yield { content: [{ type: "text" as const, text: accumulatedText }] };

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

      if (data.error) {
        yield {
          content: [
            {
              type: "text" as const,
              text: step(
                `- ⚠️ ${data.error.message ?? "something went wrong"}. Please try again.`,
              ),
            },
          ],
        };
        return;
      }

      if (data.stop_reason === "tool_use") {
        const toolUseBlocks = data.content.filter(
          (b: any) => b.type === "tool_use",
        );

        // ── Data calls ──────────────────────────────────────────────
        const dataStep = toolUseBlocks
          .map((b: any) => {
            const table = b.name.split("_").slice(1).join(" ");
            return `- 📦 Fetching ${table}...`;
          })
          .join("\n");

        yield { content: [{ type: "text" as const, text: step(dataStep) }] };

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
          // ── Reply/planning call ───────────────────────────────────
          yield {
            content: [
              {
                type: "text" as const,
                text: step("- 💬 How can I put this together..."),
              },
            ],
          };

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

          if (followUpData.error) {
            yield {
              content: [
                {
                  type: "text" as const,
                  text: step(
                    `- ⚠️ ${followUpData.error.message ?? "something went wrong"}. Please try again.`,
                  ),
                },
              ],
            };
            return;
          }

          if (followUpData.stop_reason === "tool_use") {
            const nextToolBlocks = followUpData.content.filter(
              (b: any) => b.type === "tool_use",
            );

            // ── More data calls ───────────────────────────────────
            const nextDataStep = nextToolBlocks
              .map((b: any) => {
                const table = b.name.split("_").slice(1).join(" ");
                return `- 📦 Fetching ${table}...`;
              })
              .join("\n");

            yield {
              content: [{ type: "text" as const, text: step(nextDataStep) }],
            };

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
            // ── Final reply ───────────────────────────────────────
            yield {
              content: [
                {
                  type: "text" as const,
                  text: step("- 💬 How can I put this together..."),
                },
              ],
            };
            const text = followUpData.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("");
            yield {
              content: [
                {
                  type: "text" as const,
                  text: `${accumulatedText}\n---\n\n${text}`,
                },
              ],
            };
            break;
          }
        }
      } else {
        // ── Direct reply (no tools needed) ───────────────────────
        yield {
          content: [
            {
              type: "text" as const,
              text: step("- 💬 How can I put this together..."),
            },
          ],
        };

        const replyData = await fetchClaude(
          {
            model: MODEL_RESPONDER,
            max_tokens: 1000,
            system: systemPrompt,
            messages: formattedMessages,
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
            {
              type: "text" as const,
              text: `${accumulatedText}\n---\n\n${text}`,
            },
          ],
        };
      }
    },
  };
}
