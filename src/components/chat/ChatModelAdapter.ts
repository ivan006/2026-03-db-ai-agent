import type { ChatModelAdapter } from "@assistant-ui/react";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_API_URL = import.meta.env.DEV
  ? "/anthropic/v1/messages"
  : import.meta.env.VITE_API_GATEWAY_URL;

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── IA Ability Layer ──────────────────────────────────────────────
// These are the only operations the IA is allowed to perform.
// Each tool maps directly to a Supabase JS call.

const IA_TOOLS = [
  {
    name: "list_tables",
    description:
      "Lists all available tables in the database that the user can interact with.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_deals",
    description:
      "Fetches deals from the database. Can filter by status and/or minimum value.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "closed"],
          description: "Filter deals by status",
        },
        min_value: {
          type: "number",
          description:
            "Filter deals with value greater than or equal to this amount",
        },
      },
      required: [],
    },
  },
  {
    name: "create_deal",
    description: "Creates a new deal in the database.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the deal or company",
        },
        status: {
          type: "string",
          enum: ["open", "closed"],
          description: "The status of the deal",
        },
        value: {
          type: "number",
          description: "The monetary value of the deal",
        },
      },
      required: ["name"],
    },
  },
];

// ── Tool Execution ────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "list_tables": {
      const { data, error } = await supabase.rpc("list_public_tables");

      if (error) {
        // Fallback — query information_schema directly
        const { data: schemaData, error: schemaError } = await supabase
          .from("information_schema.tables" as any)
          .select("table_name")
          .eq("table_schema", "public")
          .eq("table_type", "BASE TABLE");

        if (schemaError) {
          // Last resort — return known tables from ability layer
          const known = ["deals"];
          return JSON.stringify({ tables: known });
        }

        return JSON.stringify({
          tables: schemaData?.map((t: any) => t.table_name),
        });
      }

      return JSON.stringify({ tables: data });
    }

    case "query_deals": {
      let query = supabase.from("deals").select("*");

      if (input.status) {
        query = query.eq("status", input.status as string);
      }
      if (input.min_value !== undefined) {
        query = query.gte("value", input.min_value as number);
      }

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ deals: data });
    }

    case "create_deal": {
      const { data, error } = await supabase
        .from("deals")
        .insert({
          name: input.name as string,
          status: (input.status as string) ?? "open",
          value: input.value as number,
        })
        .select()
        .single();

      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ deal: data });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── Claude API helper ─────────────────────────────────────────────

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
When a user asks about data, use the available tools to query the database.
When a user wants to create or add something, use the appropriate create tool.
Then explain the results in plain, friendly language.
Never show raw JSON or technical details — always interpret results naturally.
If you are unsure what the user wants, ask a clarifying question.`;

// ── Adapter ───────────────────────────────────────────────────────

export const IAModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
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
        system: SYSTEM_PROMPT,
        tools: IA_TOOLS,
        messages: formattedMessages,
      },
      abortSignal,
    );

    // ── read → act → reply loop ───────────────────────────────────
    if (data.stop_reason === "tool_use") {
      const toolUseBlock = data.content.find((b: any) => b.type === "tool_use");

      if (toolUseBlock) {
        yield {
          content: [
            {
              type: "text" as const,
              text: `_Working on it..._\n\n`,
            },
          ],
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
            system: SYSTEM_PROMPT,
            tools: IA_TOOLS,
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
