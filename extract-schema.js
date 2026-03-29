#!/usr/bin/env node
// ── extract-schema.js ─────────────────────────────────────────────
// Converts the output of `npx supabase gen types typescript` into a
// rich schema.json that the IA can use for dynamic tool generation.
//
// Usage:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_ID | node scripts/extract-schema.js
//
// Output:
//   src/schema.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "../src/schema.json");

// ── Read stdin ────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

// ── Type mapping ──────────────────────────────────────────────────
// Maps TypeScript types from the CLI output to friendly type names.

function mapType(rawType) {
  if (rawType.includes("Database[")) return "uuid"; // enum ref or FK
  const base = rawType.replace("| null", "").trim();
  const map = {
    string: "text",
    number: "number",
    boolean: "boolean",
    Json: "json",
  };
  return map[base] ?? base;
}

// ── Parse Row block ───────────────────────────────────────────────
// Extracts column name and type from a Row: { ... } block.

function parseRowBlock(block) {
  const columns = {};
  const lineRegex = /^\s{10}(\w+):\s*(.+?);?\s*$/gm;
  let match;
  while ((match = lineRegex.exec(block)) !== null) {
    const [, name, rawType] = match;
    columns[name] = {
      type: mapType(rawType),
      nullable: rawType.includes("| null"),
    };
  }
  return columns;
}

// ── Parse Insert block ────────────────────────────────────────────
// Fields without `?` are required on insert.

function parseInsertBlock(block) {
  const required = [];
  const lineRegex = /^\s{10}(\w+)(\?)?\s*:/gm;
  let match;
  while ((match = lineRegex.exec(block)) !== null) {
    const [, name, optional] = match;
    if (!optional) required.push(name);
  }
  return required;
}

// ── Parse Relationships block ─────────────────────────────────────

function parseRelationships(block) {
  const relationships = [];
  // Normalize line endings before matching
  const normalized = block.replace(/\r\n/g, "\n");
  const relRegex =
    /foreignKeyName:\s*"([^"]+)"[\s\S]*?columns:\s*\["([^"]+)"\][\s\S]*?isOneToOne:\s*(true|false)[\s\S]*?referencedRelation:\s*"([^"]+)"[\s\S]*?referencedColumns:\s*\["([^"]+)"\]/g;
  let match;
  while ((match = relRegex.exec(normalized)) !== null) {
    const [, fkName, cols, isOneToOne, refTable, refCols] = match;
    relationships.push({
      foreignKey: fkName,
      columns: cols
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      isOneToOne: isOneToOne === "true",
      referencedTable: refTable,
      referencedColumns: refCols
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    });
  }
  return relationships;
}

// ── Parse Enums ───────────────────────────────────────────────────

function parseEnums(content) {
  const enums = {};
  const enumsMatch = content.match(
    /Enums:\s*\{([\s\S]*?)\};?\s*CompositeTypes/,
  );
  if (!enumsMatch) return enums;

  const enumRegex = /(\w+):\s*((?:"[^"]+"\s*\|?\s*)+)/g;
  let match;
  while ((match = enumRegex.exec(enumsMatch[1])) !== null) {
    const [, name, values] = match;
    enums[name] = values
      .split("|")
      .map((v) => v.trim().replace(/"/g, ""))
      .filter(Boolean);
  }
  return enums;
}

// ── Parse Tables ──────────────────────────────────────────────────

function parseTables(content, enums) {
  const schema = {};

  const tablesMatch = content.match(/Tables:\s*\{([\s\S]*?)Views:/);
  if (!tablesMatch) {
    console.error("Could not find Tables block in input.");
    process.exit(1);
  }

  // Split into per-table blocks — each table ends at the next table definition
  // or the closing of the Tables block. We match greedily up to the next
  // top-level table key (6-space indent) or the end of the tables block.
  const tablesBlock = tablesMatch[1];
  const tableRegex = /^      (\w+): \{([\s\S]*?)\n      \};/gm;
  let match;

  while ((match = tableRegex.exec(tablesBlock)) !== null) {
    const [, tableName, tableBody] = match;

    const rowMatch = tableBody.match(/Row:\s*\{([\s\S]*?)\};/);
    const insertMatch = tableBody.match(/Insert:\s*\{([\s\S]*?)\};/);
    const relMatch = tableBody.match(
      /Relationships:\s*\[([\s\S]*?)\n        \];/,
    );

    const columns = rowMatch ? parseRowBlock(rowMatch[1]) : {};
    const requiredOnInsert = insertMatch
      ? parseInsertBlock(insertMatch[1])
      : [];
    const relationships = relMatch ? parseRelationships(relMatch[1]) : [];

    // Resolve enum values into column definitions
    for (const [colName, colDef] of Object.entries(columns)) {
      // Check if the raw type references an enum
      const enumMatch = tableBody.match(
        new RegExp(
          `${colName}\\s*:\\s*Database\\["public"\\]\\["Enums"\\]\\["(\\w+)"\\]`,
        ),
      );
      if (enumMatch) {
        const enumName = enumMatch[1];
        colDef.type = "enum";
        colDef.enumValues = enums[enumName] ?? [];
      }
    }

    schema[tableName] = {
      columns,
      requiredOnInsert: requiredOnInsert.filter(
        (f) => f !== "id" && f !== "created_at",
      ),
      relationships,
    };
  }

  return schema;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const input = (await readStdin()).replace(/\r\n/g, "\n");

  if (!input.trim()) {
    console.error(
      "No input received. Pipe the supabase CLI output into this script:\n" +
        "  npx supabase gen types typescript --project-id YOUR_ID | node scripts/extract-schema.js",
    );
    process.exit(1);
  }

  const enums = parseEnums(input);
  const schema = parseTables(input, enums);

  const tableCount = Object.keys(schema).length;
  if (tableCount === 0) {
    console.error(
      "No tables found in input. Check that the CLI output is valid.",
    );
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(schema, null, 2));

  console.log(`✓ schema.json written to ${OUTPUT_PATH}`);
  console.log(`  ${tableCount} tables extracted:`);
  for (const [table, def] of Object.entries(schema)) {
    const colCount = Object.keys(def.columns).length;
    const relCount = def.relationships.length;
    console.log(
      `  - ${table}: ${colCount} columns, ${relCount} relationship${relCount !== 1 ? "s" : ""}`,
    );
  }
  if (Object.keys(enums).length > 0) {
    console.log(
      `  ${Object.keys(enums).length} enums: ${Object.keys(enums).join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
