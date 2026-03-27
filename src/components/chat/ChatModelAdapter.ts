import type { ChatModelAdapter } from "@assistant-ui/react";

const ANTHROPIC_API_URL = "/anthropic/v1/messages";

export const AWsChatModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(import.meta.env.DEV && {
          "anthropic-dangerous-direct-browser-access": "true",
        }),
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        stream: true,
        system:
          "You are an IA (Information Agent). You help users interact with their data.",
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content
            .filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join(" "),
        })),
      }),
      signal: abortSignal,
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            accumulated += parsed.delta.text;
            yield { content: [{ type: "text" as const, text: accumulated }] };
          }
        } catch {}
      }
    }
  },
};
