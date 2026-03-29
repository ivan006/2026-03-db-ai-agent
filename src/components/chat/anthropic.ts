// ── Anthropic API ─────────────────────────────────────────────────
// Handles all communication with the Claude API.
// Two system prompts:
//   buildPlannerPrompt — terse, tool-focused, for Haiku
//   buildResponderPrompt — full personality + schema, for Sonnet

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

// ── Shared helpers ────────────────────────────────────────────────

function buildTableMap(tools: IATool[]): Record<string, string[]> {
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
  return tableMap;
}

function buildUserSection(user: SessionUser | null): string {
  if (!user) return "";
  return `## Current user\nid: ${user.id}\nemail: ${user.email ?? "unknown"}${Object.keys(user.metadata).length ? `\nmetadata: ${JSON.stringify(user.metadata)}` : ""}\n`;
}

// ── Planner prompt (Haiku) ────────────────────────────────────────
// Terse and tool-focused. No personality, no schema detail.
// Haiku's only job is to decide which tools to call and in what order.

export function buildPlannerPrompt(user: SessionUser | null = null): string {
  const userSection = buildUserSection(user);

  return `You are a data retrieval planner. 
  Your only job is to call the right tools to gather the data needed to answer the user's request.
A separate explainer will read your tool results and write the reply — so never write explanations or answers yourself, only call tools. 
It will be shown as a process label. So just tell us what tools you using and dont report on data the tools yield.
If you must include text before a tool call, use 15 words or fewer.

${userSection}`;
}

// ── Responder prompt (Sonnet) ─────────────────────────────────────
// Full personality, schema detail, formatting rules.
// Sonnet's job is to interpret the tool results and reply naturally.

export function buildResponderPrompt(
  tools: IATool[],
  personality: string = "",
  user: SessionUser | null = null,
): string {
  const tableMap = buildTableMap(tools);

  // Build relationship map from query tool descriptions
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

  const capabilityLines = Object.entries(tableMap)
    .map(([table, actions]) => `- **${table}**: ${actions.join(", ")}`)
    .join("\n");

  const personalitySection = personality
    ? `## Personality\n${personality}\n`
    : "";
  const userSection = buildUserSection(user);

  return `You are an IA (Information Agent). You help users interact with their data.
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

Present results clearly — use a key data point as the title for each record, not just a number.
Explain results in plain, friendly language.
If you are unsure what the user wants, ask a clarifying question.`;
}
