import type { ChatModelAdapter } from "@assistant-ui/react";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_API_URL = import.meta.env.DEV
  ? "/anthropic/v1/messages"
  : import.meta.env.VITE_API_GATEWAY_URL;

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Dynamic Tool Generation ───────────────────────────────────────
// Tools are generated from RLS policies in the database.
// Adding a policy automatically adds the corresponding IA tool.
// Removing a policy removes the tool. No code changes needed.

type Policy = {
  tablename: string;
  cmd: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
};

function cmdToToolName(cmd: string, tablename: string): string {
  switch (cmd.toUpperCase()) {
    case "SELECT":
      return `query_${tablename}`;
    case "INSERT":
      return `create_${tablename}`;
    case "UPDATE":
      return `update_${tablename}`;
    case "DELETE":
      return `delete_${tablename}`;
    default:
      return `${cmd.toLowerCase()}_${tablename}`;
  }
}

function cmdToDescription(cmd: string, tablename: string): string {
  switch (cmd.toUpperCase()) {
    case "SELECT":
      return `Fetches records from the ${tablename} table. Supports optional filters.`;
    case "INSERT":
      return `Creates a new record in the ${tablename} table.`;
    case "UPDATE":
      return `Updates an existing record in the ${tablename} table.`;
    case "DELETE":
      return `Deletes a record from the ${tablename} table.`;
    default:
      return `Performs ${cmd} operation on the ${tablename} table.`;
  }
}

function cmdToHumanLabel(cmd: string, tablename: string): string {
  const table = tablename.replace(/_/g, " ");
  switch (cmd.toUpperCase()) {
    case "SELECT":
      return `View ${table} — search and filter your ${table}`;
    case "INSERT":
      return `Create a ${table.replace(/s$/, "")} — add a new ${table.replace(/s$/, "")} to the database`;
    case "UPDATE":
      return `Update a ${table.replace(/s$/, "")} — modify an existing ${table.replace(/s$/, "")}`;
    case "DELETE":
      return `Delete a ${table.replace(/s$/, "")} — remove a ${table.replace(/s$/, "")} from the database`;
    default:
      return `${cmd} ${table}`;
  }
}

async function buildToolsFromPolicies() {
  const { data, error } = await supabase.rpc("get_ia_tools");

  if (error || !data) {
    console.error("Failed to load IA tools from policies:", error?.message);
    return { tools: [], humanLabels: [] as string[] };
  }

  const policies: Policy[] = data;

  // Deduplicate — one tool per table+cmd combination
  const seen = new Set<string>();
  const tools = [];
  const humanLabels: string[] = [];

  for (const policy of policies) {
    const key = `${policy.tablename}_${policy.cmd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    tools.push({
      name: cmdToToolName(policy.cmd, policy.tablename),
      description: cmdToDescription(policy.cmd, policy.tablename),
      input_schema: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: `Optional key-value filters to apply to the ${policy.tablename} query`,
          },
          data: {
            type: "object",
            description: `Data payload for INSERT or UPDATE operations on ${policy.tablename}`,
          },
          id: {
            type: "string",
            description: `Record ID for UPDATE or DELETE operations on ${policy.tablename}`,
          },
        },
        required: [],
      },
    });

    humanLabels.push(cmdToHumanLabel(policy.cmd, policy.tablename));
  }

  // Always include list_tables
  tools.unshift({
    name: "list_tables",
    description: "Lists all available tables in the database.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  });

  humanLabels.unshift("List tables — see what data is available");

  return { tools, humanLabels };
}

// ── Tool Execution ────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  // list_tables
  if (name === "list_tables") {
    const { data, error } = await supabase.rpc("list_public_tables");
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ tables: data?.map((t: any) => t.table_name) });
  }

  // Parse tool name — e.g. query_deals, create_deals, update_deals, delete_deals
  const match = name.match(/^(query|create|update|delete)_(.+)$/);
  if (!match) return JSON.stringify({ error: `Unknown tool: ${name}` });

  const [, cmd, tablename] = match;

  switch (cmd) {
    case "query": {
      let query = supabase.from(tablename).select("*");
      const filters = input.filters as Record<string, unknown> | undefined;
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value as string);
        }
      }
      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ [tablename]: data });
    }

    case "create": {
      const { data, error } = await supabase
        .from(tablename)
        .insert(input.data as object)
        .select()
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ [tablename]: data });
    }

    case "update": {
      const { data, error } = await supabase
        .from(tablename)
        .update(input.data as object)
        .eq("id", input.id as string)
        .select()
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ [tablename]: data });
    }

    case "delete": {
      const { error } = await supabase
        .from(tablename)
        .delete()
        .eq("id", input.id as string);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true });
    }

    default:
      return JSON.stringify({ error: `Unknown command: ${cmd}` });
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

// ── Adapter ───────────────────────────────────────────────────────

export const IAModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    // Load tools dynamically from database policies
    const { tools, humanLabels } = await buildToolsFromPolicies();

    // System prompt built from actual tools — no hardcoding
    const SYSTEM_PROMPT = `You are an IA (Information Agent). You help users interact with their data.

Your available abilities are:
${humanLabels.map((label) => `- ${label}`).join("\n")}

When asked what you can do, respond in exactly this format — no emojis, no nested bullets, no extra formatting:

Here's what I can help you with:

${humanLabels.map((label) => `${label}`).join("\n")}

What would you like to do?

When a user asks about data, use the available tools to query the database.
When a user wants to create, update or delete something, use the appropriate tool.
Then explain the results in plain, friendly language.
Never show raw JSON or technical details — always interpret results naturally.
If you are unsure what the user wants, ask a clarifying question.`;

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
