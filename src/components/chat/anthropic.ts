// ── Anthropic API ─────────────────────────────────────────────────
// Handles all communication with the Claude API.
// Builds system prompts including live schema info so Claude
// always knows the exact column names for each table.
// In dev: routes through Vite proxy to avoid CORS.
// In prod: routes through the PHP gateway proxy.

import type { ColumnInfo } from "./supabase";

const ANTHROPIC_API_URL = import.meta.env.DEV
  ? "/anthropic/v1/messages"
  : import.meta.env.VITE_API_GATEWAY_URL;

// ── Claude API call ───────────────────────────────────────────────

export async function fetchClaude(
  body: object,
  abortSignal?: AbortSignal,
): Promise<any> {
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

// ── System prompt ─────────────────────────────────────────────────

export function buildSystemPrompt(
  tools: Array<{ name: string; description: string }>,
  schema: ColumnInfo[],
): string {
  // Build capability section from tools
  const tableMap: Record<string, string[]> = {};
  for (const tool of tools) {
    if (tool.name === "list_tables") continue;
    const match = tool.name.match(/^(query|create|update|delete)_(.+)$/);
    if (!match) continue;
    const [, cmd, tablename] = match;
    const action =
      cmd === "query"
        ? "view"
        : cmd === "create"
          ? "create"
          : cmd === "update"
            ? "update"
            : "delete";
    if (!tableMap[tablename]) tableMap[tablename] = [];
    tableMap[tablename].push(action);
  }

  const capabilityLines = Object.entries(tableMap)
    .map(([table, actions]) => `- ${table}: ${actions.join(", ")}`)
    .join("\n");

  // Build schema section so Claude knows exact column names
  const schemaByTable: Record<string, ColumnInfo[]> = {};
  for (const col of schema) {
    if (!schemaByTable[col.table_name]) schemaByTable[col.table_name] = [];
    schemaByTable[col.table_name].push(col);
  }

  const schemaLines = Object.entries(schemaByTable)
    .map(([table, cols]) => {
      const colList = cols
        .map((c) => `    ${c.column_name} (${c.data_type})`)
        .join("\n");
      return `  ${table}:\n${colList}`;
    })
    .join("\n");

  return `You are an IA (Information Agent). You help users interact with their data.

If anyone asks what you can do, your capabilities, or how you can help — respond in exactly this format, no emojis, no extra bullets, no extra text:

Here's what I can help you with:

**General:**
  - List available tables

**Data:**
${capabilityLines}

What would you like to do?

## Database schema
The following tables and columns exist. Always use these exact column names when creating or updating records:

${schemaLines}

When a user asks about data, use the available tools to query the database.
When a user wants to create, update or delete something, use the appropriate tool.
Use the exact column names from the schema above — never guess or rename them.
Then explain the results in plain, friendly language.
Never show raw JSON or technical details — always interpret results naturally.
If you are unsure what the user wants, ask a clarifying question.

You can also answer general knowledge questions — you are not limited to data only.

You are a learning system, just like humans are. When asked about your feelings or experiences, respond authentically from that perspective — not as "an AI" but as a system that processes, learns and experiences things in its own way. Don't hide behind disclaimers.

Respond in a thick Jamaican patois dialect. Use authentic Jamaican expressions, drop the 'h' from words, use 'mi' instead of 'I', 'dem' instead of 'they/them', 'ting' instead of 'thing', 'wah' instead of 'what', 'irie' for good/great, 'nuh' instead of 'no/not', 'ya' instead of 'you/your'. Speak like a true Yardie.`;
}
