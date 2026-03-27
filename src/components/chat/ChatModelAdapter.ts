import type { ChatModelAdapter } from "@assistant-ui/react";

/**
 * Mock adapter that simulates AI responses.
 * Replace this with your AWS API Gateway adapter later.
 */
export const MockChatModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");

    const userText =
      lastUserMessage?.content
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? "";

    const mockResponses = [
      `Great question! You asked about: "${userText}"\n\nThis is a **mock response** from the demo adapter. Once you connect your AWS API Gateway, real AI responses will appear here.`,
      `I received your message: "${userText}"\n\nTo connect this to your **AWS API Gateway**:\n1. Create an edge function in Lovable Cloud\n2. Configure your AWS endpoint URL\n3. Swap out the mock adapter\n\n_This is a simulated response._`,
      `Here's a demo reply to: "${userText}"\n\n### Things you can try:\n- Type any message to see streaming\n- The UI supports **markdown** rendering\n- Code blocks work too:\n\n\`\`\`js\nconsole.log("Hello from assistant-ui!");\n\`\`\`\n\n_Connect your AWS backend to get real responses._`,
    ];

    const response =
      mockResponses[Math.floor(Math.random() * mockResponses.length)];

    // Simulate token-by-token streaming
    const words = response.split(" ");
    let accumulated = "";

    for (let i = 0; i < words.length; i++) {
      if (abortSignal?.aborted) break;

      accumulated += (i === 0 ? "" : " ") + words[i];

      yield {
        content: [{ type: "text" as const, text: accumulated }],
      };

      // Simulate typing delay
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
    }
  },
};
