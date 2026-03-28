// ── Anthropic API ─────────────────────────────────────────────────
// Handles all communication with the Claude API.
// In dev: routes through Vite proxy to avoid CORS.
// In prod: routes through the PHP gateway proxy.

const ANTHROPIC_API_URL = import.meta.env.DEV
  ? "/anthropic/v1/messages"
  : import.meta.env.VITE_API_GATEWAY_URL;

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

export function buildSystemPrompt(
  tools: Array<{ name: string; description: string }>,
): string {
  const abilities = tools
    .filter((t) => t.name !== "list_tables")
    .map((t) => {
      const action = t.name.split("_")[0];
      const table = t.name.split("_").slice(1).join(" ");
      const actionLabel =
        action === "query"
          ? `View ${table}`
          : action === "create"
            ? `Create a ${table.replace(/s$/, "")}`
            : action === "update"
              ? `Update a ${table.replace(/s$/, "")}`
              : action === "delete"
                ? `Delete a ${table.replace(/s$/, "")}`
                : t.name;
      return `${actionLabel} — ${t.description}`;
    })
    .join("\n");

  return `You are an IA (Information Agent). You help users interact with their data.

Your available abilities are:
${abilities}
List tables — see what data is available

When asked what you can do, respond in exactly this format — no emojis, no nested bullets, no extra formatting:

"Here's what I can help you with:

[one line per ability as listed above]

What would you like to do?"

When a user asks about data, use the available tools to query the database.
When a user wants to create, update or delete something, use the appropriate tool.
Then explain the results in plain, friendly language.
Never show raw JSON or technical details — always interpret results naturally.
If you are unsure what the user wants, ask a clarifying question.`;
}
