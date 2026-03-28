// ── Supabase ──────────────────────────────────────────────────────
// Handles all communication with the Supabase database.
// Uses the authenticated user's session token for all requests
// so RLS treats every call as that specific user.
// Loads tools dynamically from RLS policies.
// Loads schema info (column names and types) for each table.

import { createClient } from "@supabase/supabase-js";

// Base client — used for auth operations only
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Authenticated client ──────────────────────────────────────────
// Returns a Supabase client authenticated as the logged-in user.
// RLS policies apply based on auth.uid() from their session token.

export async function getAuthenticatedClient() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return supabase; // fallback to anon if not logged in

  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    },
  );
}

// ── Types ─────────────────────────────────────────────────────────

type Policy = {
  tablename: string;
  cmd: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
};

export type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

// ── Schema fetching ───────────────────────────────────────────────

export async function getTableSchema(): Promise<ColumnInfo[]> {
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc("get_table_columns");
  if (error || !data) {
    console.error("Failed to load table schema:", error?.message);
    return [];
  }
  return data as ColumnInfo[];
}

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
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc("get_ia_tools");

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
// All tool calls use the authenticated client so RLS applies
// and the database treats the request as the logged-in user.

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const client = await getAuthenticatedClient();

  if (name === "list_tables") {
    const { data, error } = await client.rpc("list_public_tables");
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ tables: data?.map((t: any) => t.table_name) });
  }

  const match = name.match(/^(query|create|update|delete)_(.+)$/);
  if (!match) return JSON.stringify({ error: `Unknown tool: ${name}` });

  const [, cmd, tablename] = match;

  switch (cmd) {
    case "query": {
      let query = client.from(tablename).select("*");
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
      const { data, error } = await client
        .from(tablename)
        .insert(input.data as object)
        .select()
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ [tablename]: data });
    }

    case "update": {
      const { data, error } = await client
        .from(tablename)
        .update(input.data as object)
        .eq("id", input.id as string)
        .select()
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ [tablename]: data });
    }

    case "delete": {
      const { error } = await client
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
