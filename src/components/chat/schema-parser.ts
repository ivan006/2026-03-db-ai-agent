// ── Schema Parser ─────────────────────────────────────────────────
// Reads src/schema.ts as raw text at build time using Vite's
// import.meta.glob with { as: 'raw' } — no manual edits needed.
// Extracts table names and column names from the Database type.

const modules = import.meta.glob("/src/schema.ts", { as: "raw", eager: true });
const raw = (Object.values(modules)[0] as string) ?? "";

function extractSchema(schemaContent: string): Record<string, string[]> {
  const schema: Record<string, string[]> = {};

  const tablesMatch = schemaContent.match(/Tables:\s*\{([\s\S]*?)Views:/);
  if (!tablesMatch) return schema;

  const tablesBlock = tablesMatch[1];
  const tableRegex = /(\w+):\s*\{[\s\S]*?Row:\s*\{([\s\S]*?)\};/g;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(tablesBlock)) !== null) {
    const tableName = tableMatch[1];
    const rowBlock = tableMatch[2];

    const columnRegex = /(\w+)\s*:/g;
    const columns: string[] = [];
    let colMatch;

    while ((colMatch = columnRegex.exec(rowBlock)) !== null) {
      columns.push(colMatch[1]);
    }

    if (columns.length > 0) {
      schema[tableName] = columns;
    }
  }

  return schema;
}

export const RUNTIME_SCHEMA = extractSchema(raw);
