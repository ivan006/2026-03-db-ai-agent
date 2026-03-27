import type { ChatModelAdapter } from "@assistant-ui/react";
import { a as PostgrestMcpServer } from "@supabase/mcp-server-postgrest";
import { StreamTransport } from "@supabase/mcp-utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const ANTHROPIC_API_URL = import.meta.env.DEV
  ? "/anthropic/v1/messages"
  : import.meta.env.VITE_API_GATEWAY_URL;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function createMcpClient() {
  const clientTransport = new StreamTransport();
  const serverTransport = new StreamTransport();

  clientTransport.readable.pipeTo(serverTransport.writable);
  serverTransport.readable.pipeTo(clientTransport.writable);

  const client = new Client(
    { name: "ia-client", version: "0.1.0" },
    { capabilities: {} },
  );

  const server = new PostgrestMcpServer({
    apiUrl: `${supabaseUrl}/rest/v1`,
    apiKey: supabaseAnonKey,
    schema: "public",
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  return { client, tools };
}

async function fetchClaude(body: object, abortSignal?: AbortSignal) {
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
    body: JSON.stringify(body),
    signal: abortSignal,
  });
  return response.json();
}

const SYSTEM_PROMPT = `You are an IA (Information Agent). You help users interact with their data.
When asked about data, use the available tools to query the database, then explain
the results in plain, friendly language. Never show raw JSON — always interpret it.`;

export const IAModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const { tools } = await createMcpClient();

    const toolDefinitions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" "),
    }));

    const data = await fetchClaude(
      {
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages: formattedMessages,
      },
      abortSignal,
    );

    // Handle tool use — read → act → reply loop
    if (data.stop_reason === "tool_use") {
      const toolUseBlock = data.content.find((b: any) => b.type === "tool_use");

      if (toolUseBlock) {
        yield {
          content: [
            {
              type: "text" as const,
              text: `_Querying your data..._\n\n`,
            },
          ],
        };

        const { client } = await createMcpClient();
        const toolResult = await client.callTool({
          name: toolUseBlock.name,
          arguments: toolUseBlock.input,
        });

        // Send result back to Claude for plain language interpretation
        const followUpData = await fetchClaude(
          {
            model: "claude-sonnet-4-5",
            max_tokens: 1000,
            system: SYSTEM_PROMPT,
            tools: toolDefinitions,
            messages: [
              ...formattedMessages,
              { role: "assistant", content: data.content },
              {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolUseBlock.id,
                    content: JSON.stringify(toolResult.content),
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
      // Direct text response — no tool needed
      const text = data.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      yield { content: [{ type: "text" as const, text }] };
    }
  },
};
