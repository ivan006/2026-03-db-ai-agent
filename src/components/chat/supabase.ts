// ── Supabase ──────────────────────────────────────────────────────
// Handles all communication with the Supabase database.
// Loads tools dynamically from RLS policies.
// Executes tool calls under the user's session (anon key for now,
// user JWT once auth is added).

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Types ─────────────────────────────────────────────────────────

type Policy = {
  tablename: string;
  cmd: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
};

// ── Tool generation from RLS policies ────────────────────────────
// The database policies ARE the ability layer.
// Adding a policy automatically adds the corresponding IA tool.
// Removing a policy removes the tool. No code changes needed.

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

export async function buildToolsFromPolicies() {
  const { data, error } = await supabase.rpc("get_ia_tools");

  if (error || !data) {
    console.error("Failed to load IA tools from policies:", error?.message);
    return [];
  }

  const policies: Policy[] = data;

  // Deduplicate — one tool per table+cmd combination
  const seen = new Set<string>();
  const tools = [];

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

  return tools;
}

// ── Tool Execution ────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "list_tables") {
    const { data, error } = await supabase.rpc("list_public_tables");
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ tables: data?.map((t: any) => t.table_name) });
  }

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
