// ── IA Orchestrator ───────────────────────────────────────────────
// Manages the read → act → reply loop between Claude and Supabase.
// Loads tools dynamically from RLS policies on each run.

import type { ChatModelAdapter } from "@assistant-ui/react";
import { fetchClaude, buildSystemPrompt } from "./anthropic";
import { buildToolsFromPolicies, executeTool } from "./supabase";

export const IAModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    // Load tools dynamically from database policies
    const tools = await buildToolsFromPolicies();

    // System prompt built from actual tools
    const systemPrompt = buildSystemPrompt(tools);

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
      const toolUseBlock = data.content.find((b: any) => b.type === "tool_use");

      if (toolUseBlock) {
        yield {
          content: [{ type: "text" as const, text: `_Working on it..._\n\n` }],
        };

        // Execute the tool against Supabase
        const toolResult = await executeTool(
          toolUseBlock.name,
          toolUseBlock.input,
        );

        // Send result back to Claude for plain language interpretation
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
      // Direct response — no tool needed
      const text = data.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      yield { content: [{ type: "text" as const, text }] };
    }
  },
};
