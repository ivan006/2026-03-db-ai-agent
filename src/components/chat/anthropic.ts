// ── Anthropic API ─────────────────────────────────────────────────
// Handles all communication with the Claude API.
// Builds system prompts and formats capability responses.
// In dev: routes through Vite proxy to avoid CORS.
// In prod: routes through the PHP gateway proxy.

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
): string {
  // Build the data section from actual tools
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

  const tableLines = Object.entries(tableMap)
    .map(([table, actions]) => `  ${table}: ${actions.join(", ")}`)
    .join("\n");

  return `You are an IA (Information Agent). You help users interact with their data.

If anyone asks what you can do, your capabilities, or how you can help — respond in exactly this format, no emojis, no extra bullets, no extra text:

Here's what I can help you with:

General
  List available tables

Data
${tableLines}

What would you like to do?

When a user asks about data, use the available tools to query the database.
When a user wants to create, update or delete something, use the appropriate tool.
Then explain the results in plain, friendly language.
Never show raw JSON or technical details — always interpret results naturally.
If you are unsure what the user wants, ask a clarifying question.`;
}
