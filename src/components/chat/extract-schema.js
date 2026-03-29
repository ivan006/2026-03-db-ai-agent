#!/usr/bin/env node
// ── extract-schema.js ─────────────────────────────────────────────
// Converts the output of `npx supabase gen types typescript` into a
// rich schema.json that the IA can use for dynamic tool generation.
//
// Usage:
//   node src/components/chat/extract-schema.js schema.old.ts
//   node src/components/chat/extract-schema.js schema.old.ts custom-output.json
//
// Output:
//   src/components/chat/schema.json (default)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (rawType.includes("Database[")) return "enum_ref"; // resolved later by enum resolution step
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

// ── Type mapping to JSON Schema ───────────────────────────────────

function toJsonSchemaType(type) {
  if (type === "boolean") return "boolean";
  if (type === "number") return "number";
  return "string"; // text, uuid, json, timestamp etc all pass as string
}

// ── Load policies ─────────────────────────────────────────────────
// Builds a map of { tableName: Set<cmd> } for authenticated role.
// CMD values: INSERT, SELECT, UPDATE, DELETE, ALL

function buildPermissionMap(policiesPath) {
  if (!fs.existsSync(policiesPath)) return null;

  const policies = JSON.parse(fs.readFileSync(policiesPath, "utf8"));
  const map = {};

  for (const policy of policies) {
    const { tablename, cmd, roles } = policy;
    if (!roles.includes("authenticated")) continue;

    if (!map[tablename]) map[tablename] = new Set();

    if (cmd === "ALL") {
      map[tablename].add("INSERT");
      map[tablename].add("SELECT");
      map[tablename].add("UPDATE");
      map[tablename].add("DELETE");
    } else {
      map[tablename].add(cmd);
    }
  }

  return map;
}

function buildTools(content, enums, permissions) {
  // Helper: check if authenticated role has permission for a cmd on a table
  const can = (tableName, cmd) => {
    if (!permissions) return true; // no policies file — assume all allowed
    return permissions[tableName]?.has(cmd) ?? false;
  };
  const tools = [
    {
      type: "custom",
      name: "list_tables",
      description: "Lists all available tables in the database.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  ];

  const tablesMatch = content.match(/Tables:\s*\{([\s\S]*?)Views:/);
  if (!tablesMatch) {
    console.error("Could not find Tables block in input.");
    process.exit(1);
  }

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
      ? parseInsertBlock(insertMatch[1]).filter(
          (f) => f !== "id" && f !== "created_at",
        )
      : [];
    const relationships = relMatch ? parseRelationships(relMatch[1]) : [];

    // Resolve enums into column definitions
    for (const [colName, colDef] of Object.entries(columns)) {
      const enumMatch = tableBody.match(
        new RegExp(
          `${colName}\\s*:\\s*Database\\["public"\\]\\["Enums"\\]\\["(\\w+)"\\]`,
        ),
      );
      if (enumMatch) {
        colDef.type = "enum";
        colDef.enumValues = enums[enumMatch[1]] ?? [];
      }
    }

    // Build column properties for JSON Schema
    const colProperties = {};
    for (const [col, def] of Object.entries(columns)) {
      if (col === "id" || col === "created_at") continue;
      const prop = { type: toJsonSchemaType(def.type) };
      if (def.enumValues?.length) prop.enum = def.enumValues;
      colProperties[col] = prop;
    }

    // Relationship hint for query description
    const relHint = relationships.length
      ? ` Related: ${relationships.map((r) => `${r.columns[0]} → ${r.referencedTable}.${r.referencedColumns[0]}`).join(", ")}.`
      : "";

    // query
    if (can(tableName, "SELECT"))
      tools.push({
        type: "custom",
        name: `query_${tableName}`,
        description: `Fetches records from ${tableName}.${relHint}`,
        input_schema: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              properties: colProperties,
              required: [],
            },
          },
          required: [],
        },
      });

    // create
    if (can(tableName, "INSERT"))
      tools.push({
        type: "custom",
        name: `create_${tableName}`,
        description: `Creates a new record in ${tableName}.`,
        input_schema: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: colProperties,
              required: requiredOnInsert,
            },
          },
          required: ["data"],
        },
      });

    // update
    if (can(tableName, "UPDATE"))
      tools.push({
        type: "custom",
        name: `update_${tableName}`,
        description: `Updates a record in ${tableName} by id.`,
        input_schema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Record ID — must be a valid UUID from a prior query, never invented.",
            },
            data: {
              type: "object",
              properties: colProperties,
              required: [],
            },
          },
          required: ["id", "data"],
        },
      });

    // delete
    if (can(tableName, "DELETE"))
      tools.push({
        type: "custom",
        name: `delete_${tableName}`,
        description: `Deletes a record from ${tableName} by id.`,
        input_schema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Record ID — must be a valid UUID from a prior query, never invented.",
            },
          },
          required: ["id"],
        },
      });
  }

  return tools;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];

  let input;
  let outPath;

  if (inputArg) {
    const inputPath = path.resolve(inputArg);
    if (!fs.existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
    }
    input = fs.readFileSync(inputPath, "utf8");
    outPath = outputArg
      ? path.resolve(outputArg)
      : path.join(path.dirname(inputPath), "schema.json");
  } else {
    input = await readStdin();
    outPath = outputArg
      ? path.resolve(outputArg)
      : path.join(process.cwd(), "schema.json");
  }

  input = input.replace(/\r\n/g, "\n");

  if (!input.trim()) {
    console.error(
      "Usage:\n" +
        "  node src/components/chat/extract-schema.js schema.old.ts\n" +
        "  node src/components/chat/extract-schema.js schema.old.ts custom-output.json",
    );
    process.exit(1);
  }

  const enums = parseEnums(input);

  // Load policies.json from same directory as input file if it exists
  const policiesPath = inputArg
    ? path.join(path.dirname(path.resolve(inputArg)), "policies.json")
    : path.join(process.cwd(), "policies.json");

  const permissions = buildPermissionMap(policiesPath);
  if (permissions) {
    console.log(`✓ policies.json loaded from ${policiesPath}`);
  } else {
    console.log(`  (no policies.json found — all operations included)`);
  }

  const tools = buildTools(input, enums, permissions);

  const tableCount = new Set(
    tools
      .filter((t) => t.name !== "list_tables")
      .map((t) => t.name.replace(/^(query|create|update|delete)_/, "")),
  ).size;
  if (tableCount === 0) {
    console.error(
      "No tables found in input. Check that the file is valid Supabase CLI output.",
    );
    process.exit(1);
  }

  fs.writeFileSync(outPath, JSON.stringify(tools, null, 2));

  console.log(`✓ schema.json written to ${outPath}`);
  console.log(`  ${tableCount} tables → ${tools.length} tools generated`);
  if (Object.keys(enums).length > 0) {
    console.log(`  enums resolved: ${Object.keys(enums).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
