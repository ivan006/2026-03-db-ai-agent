// ── Supabase ──────────────────────────────────────────────────────
// Handles all communication with the Supabase database.
// Uses the authenticated user's session token for all requests
// so RLS treats every call as that specific user.
// Schema is parsed from src/schema.ts at build time via schema-parser.ts

import { createClient } from "@supabase/supabase-js";
import { RUNTIME_SCHEMA, type TableDef } from "./schema-parser";

// Base client — used for auth operations only
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Authenticated client ──────────────────────────────────────────

export async function getAuthenticatedClient() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return supabase;

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

// ── Tool generation ───────────────────────────────────────────────

export type IATool = {
  name: string;
  description: string;
  input_schema: object;
};

export function buildToolsFromSchema(): IATool[] {
  const tools: IATool[] = [
    {
      name: "list_tables",
      description: "Lists all available tables in the database.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
  ];

  for (const [tablename, tableDef] of Object.entries(RUNTIME_SCHEMA)) {
    const { columns, requiredOnInsert, relationships } = tableDef as TableDef;

    // Build a readable column summary with types for tool descriptions
    const colSummary = Object.entries(columns)
      .map(([col, def]) => {
        const type = def.enumValues?.length
          ? `enum(${def.enumValues.join("|")})`
          : def.type;
        return `${col}:${type}${def.nullable ? "?" : ""}`;
      })
      .join(", ");

    // Relationship hint for query tool
    const relHint = relationships.length
      ? ` Related tables: ${relationships.map((r) => `${r.columns[0]} → ${r.referencedTable}.${r.referencedColumns[0]}`).join(", ")}.`
      : "";

    tools.push({
      name: `query_${tablename}`,
      description: `Fetches records from ${tablename}.${relHint} Columns: ${colSummary}. Supports optional key-value filters.`,
      input_schema: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: `Key-value pairs to filter ${tablename} records. Use exact column names.`,
          },
        },
        required: [],
      },
    });

    // Build required/optional properties for create tool
    const createProperties: Record<string, object> = {};
    for (const [col, def] of Object.entries(columns)) {
      if (col === "id" || col === "created_at") continue;
      const type = def.enumValues?.length
        ? `enum(${def.enumValues.join("|")})`
        : def.type;
      createProperties[col] = {
        type: "string",
        description: `${type}${def.nullable ? ", optional" : ", required"}`,
      };
    }

    tools.push({
      name: `create_${tablename}`,
      description: `Creates a new record in ${tablename}. Required fields: ${requiredOnInsert.join(", ") || "none"}.`,
      input_schema: {
        type: "object",
        properties: {
          data: {
            type: "object",
            description: `Data to insert. Required: ${requiredOnInsert.join(", ") || "none"}. All columns: ${colSummary}`,
            properties: createProperties,
          },
        },
        required: ["data"],
      },
    });

    tools.push({
      name: `update_${tablename}`,
      description: `Updates a record in ${tablename} by id. Columns: ${colSummary}.`,
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Record ID to update" },
          data: {
            type: "object",
            description: `Fields to update in ${tablename}. Use exact column names.`,
          },
        },
        required: ["id", "data"],
      },
    });

    tools.push({
      name: `delete_${tablename}`,
      description: `Deletes a record from ${tablename} by id.`,
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Record ID to delete" },
        },
        required: ["id"],
      },
    });
  }
  console.log(tools);
  return tools;
}

// ── Tool Execution ────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const client = await getAuthenticatedClient();

  if (name === "list_tables") {
    return JSON.stringify({ tables: Object.keys(RUNTIME_SCHEMA) });
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
