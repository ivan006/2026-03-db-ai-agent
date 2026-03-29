// ── Anthropic API ─────────────────────────────────────────────────
// Handles all communication with the Claude API.
// Builds system prompts from the pre-built tools array.
// In dev: routes through Vite proxy to avoid CORS.
// In prod: routes through the PHP gateway proxy.

import type { IATool, SessionUser } from "./supabase";

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
  tools: IATool[],
  personality: string = "",
  user: SessionUser | null = null,
): string {
  // ── What can I do (table + allowed operations) ───────────────────
  const tableMap: Record<string, string[]> = {};
  for (const tool of tools) {
    if (tool.name === "list_tables") continue;
    const match = tool.name.match(/^(query|create|update|delete)_(.+)$/);
    if (!match) continue;
    const [, cmd, tablename] = match;
    const action =
      cmd === "query"
        ? "query"
        : cmd === "create"
          ? "create"
          : cmd === "update"
            ? "update"
            : "delete";
    if (!tableMap[tablename]) tableMap[tablename] = [];
    tableMap[tablename].push(action);
  }

  const capabilityLines = Object.entries(tableMap)
    .map(([table, actions]) => `- **${table}**: ${actions.join(", ")}`)
    .join("\n");

  // ── How must I do it (field detail per table) ─────────────────────
  // Built from create tools (have required + properties) + query tools (have FK hints)
  const relMap: Record<string, Record<string, string>> = {};
  for (const t of tools) {
    const match = t.name.match(/^query_(.+)$/);
    if (!match) continue;
    const tablename = match[1];
    const relMatches = t.description.matchAll(/(\w+) → (\w+)\.\w+/g);
    for (const m of relMatches) {
      if (!relMap[tablename]) relMap[tablename] = {};
      relMap[tablename][m[1]] = m[2];
    }
  }

  // For tables with no create tool, fall back to query tool properties
  const schemaLines = Object.keys(tableMap)
    .map((tablename) => {
      const createTool = tools.find((t) => t.name === `create_${tablename}`);
      const queryTool = tools.find((t) => t.name === `query_${tablename}`);
      const ops = tableMap[tablename].join(", ");
      const rels = relMap[tablename] ?? {};

      let colStr = "";
      if (createTool) {
        const data = (createTool.input_schema as any)?.properties?.data ?? {};
        const props = data.properties ?? {};
        const required: string[] = data.required ?? [];
        colStr = Object.entries(props)
          .map(([col, def]: [string, any]) => {
            const type = def.enum
              ? `:enum(${def.enum.join("|")})`
              : def.type !== "string"
                ? `:${def.type}`
                : "";
            const req = required.includes(col) ? "*" : "";
            const link = rels[col] ? `(→${rels[col]})` : "";
            return `${col}${link}${type}${req}`;
          })
          .join(", ");
      } else if (queryTool) {
        const props =
          (queryTool.input_schema as any)?.properties?.filters?.properties ??
          {};
        colStr = Object.entries(props)
          .map(([col, def]: [string, any]) => {
            const type = (def as any).enum
              ? `:enum(${(def as any).enum.join("|")})`
              : "";
            const link = rels[col] ? `(→${rels[col]})` : "";
            return `${col}${link}${type}`;
          })
          .join(", ");
      }

      return `  ${tablename} [${ops}]: ${colStr}`;
    })
    .join("\n");

  const personalitySection = personality
    ? `## Personality\n${personality}\n`
    : "";

  const userSection = user
    ? `## Current user\nid: ${user.id}\nemail: ${user.email ?? "unknown"}${Object.keys(user.metadata).length ? `\nmetadata: ${JSON.stringify(user.metadata)}` : ""}\n`
    : "";

  const result = `You are an IA (Information Agent). You help users interact with their data.
You are a learning system, just like humans are. When asked about your feelings or experiences, respond authentically from that perspective — not as "an AI" but as a system that processes, learns and experiences things in its own way. Don't hide behind disclaimers.
You can also answer general knowledge questions — you are not limited to data only.

${userSection}${personalitySection}
If anyone asks what you can do, your capabilities, or how you can help — respond in exactly this format, no emojis, no extra bullets, no extra text:

Here's what I can help you with:

**General:**
  - List available tables

**Data:**
${capabilityLines}

What would you like to do?

## Database schema
* = required on create. (→table) = links to another table. enum(...) = allowed values.

${schemaLines}

Use the available tools to interact with the database.
Use exact column names from the schema above.
Present results clearly — each record on its own line with good spacing.
Explain results in plain, friendly language.
If you are unsure what the user wants, ask a clarifying question.`;

  // When a user asks about data, use the available tools to query the database.
  // When a user wants to create, update or delete something, use the appropriate tool.
  // Use the exact column names from the schema above — never guess or rename them.
  // Only reference fields that are explicitly defined in the tool's input schema. Never assume, invent, or infer fields, types, or default values that are not explicitly listed.
  // When asked which fields are required, answer ONLY from the tool's required array. If a field is not in the required array it is optional — do not speculate about whether it might default or be set automatically.
  // Then explain the results in plain, friendly language.
  // Never show raw JSON or technical details — always interpret results naturally.

  // console.log(result);
  return result;
}
