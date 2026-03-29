#!/usr/bin/env node
// ── extract-schema.js ─────────────────────────────────────────────
// Reads raw SQL exports from tools-inputs/ and outputs tools.json.
//
// Usage:
//   node src/components/chat/extract-schema.js
//
// Input:  src/components/chat/tools-inputs/{columns,enums,foreign_keys,policies}.json
// Output: src/components/chat/tools.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(__dirname, "tools-inputs");
const OUTPUT_PATH = path.join(__dirname, "tools.json");

// ── Load inputs ───────────────────────────────────────────────────

function loadInput(filename) {
  const filePath = path.join(INPUTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required input file: ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ── Type mapping ──────────────────────────────────────────────────

function toJsonSchemaType(pgType) {
  if (pgType === "boolean") return "boolean";
  if (
    pgType === "integer" ||
    pgType === "numeric" ||
    pgType === "bigint" ||
    pgType === "real" ||
    pgType === "double precision"
  )
    return "number";
  return "string";
}

// ── Build permission map ──────────────────────────────────────────

function buildPermissionMap(policies) {
  const map = {};
  for (const policy of policies) {
    const { tablename, cmd, roles } = policy;
    const rolesStr = Array.isArray(roles)
      ? roles.join(",")
      : String(roles ?? "");
    if (!rolesStr.includes("authenticated")) continue;
    if (!map[tablename]) map[tablename] = new Set();
    if (cmd === "ALL") {
      ["INSERT", "SELECT", "UPDATE", "DELETE"].forEach((c) =>
        map[tablename].add(c),
      );
    } else {
      map[tablename].add(cmd);
    }
  }
  return map;
}

// ── Main ──────────────────────────────────────────────────────────

function main() {
  console.log(`Reading inputs from ${INPUTS_DIR}`);

  const columns = loadInput("columns.json");
  const enums = loadInput("enums.json");
  const foreignKeys = loadInput("foreign_keys.json");
  const policies = loadInput("policies.json");

  // Build enum map: { enum_name: [value, ...] }
  const enumMap = {};
  for (const { enum_name, value } of enums) {
    if (!enumMap[enum_name]) enumMap[enum_name] = [];
    enumMap[enum_name].push(value);
  }

  // Build FK map: { table_name: { col: { referenced_table, referenced_column } } }
  const fkMap = {};
  for (const {
    table_name,
    column_name,
    referenced_table,
    referenced_column,
  } of foreignKeys) {
    if (!fkMap[table_name]) fkMap[table_name] = {};
    fkMap[table_name][column_name] = { referenced_table, referenced_column };
  }

  // Build permission map
  const permissions = buildPermissionMap(policies);
  const can = (tableName, cmd) => permissions[tableName]?.has(cmd) ?? false;

  // Group columns by table
  const tableMap = {};
  for (const col of columns) {
    if (!tableMap[col.table_name]) tableMap[col.table_name] = [];
    tableMap[col.table_name].push(col);
  }

  // Build tools array
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

  for (const [tableName, cols] of Object.entries(tableMap)) {
    // Build column properties
    const colProperties = {};
    const requiredOnInsert = [];

    for (const col of cols) {
      const { column_name, data_type, is_nullable, column_default } = col;
      if (column_name === "id" || column_name === "created_at") continue;

      // Check if this column is a USER-DEFINED type (enum)
      let prop;
      if (data_type === "USER-DEFINED") {
        // Try to find matching enum by looking at FK or column naming conventions
        // We match enum by column name patterns
        const matchingEnum = Object.keys(enumMap).find(
          (e) =>
            column_name.includes(e) ||
            e.includes(column_name.replace(/_/g, "")),
        );
        if (matchingEnum) {
          prop = { type: "string", enum: enumMap[matchingEnum] };
        } else {
          prop = { type: "string" };
        }
      } else {
        prop = { type: toJsonSchemaType(data_type) };
      }

      // Add FK relationship annotation
      if (fkMap[tableName]?.[column_name]) {
        prop.description = `→ ${fkMap[tableName][column_name].referenced_table}.${fkMap[tableName][column_name].referenced_column}`;
      }

      colProperties[column_name] = prop;

      // Required if NOT NULL and no default
      if (is_nullable === "NO" && !column_default) {
        requiredOnInsert.push(column_name);
      }
    }

    // Relationship hint for query description
    const rels = fkMap[tableName] ?? {};
    const relHint = Object.entries(rels).length
      ? ` Related: ${Object.entries(rels)
          .map(
            ([col, r]) =>
              `${col} → ${r.referenced_table}.${r.referenced_column}`,
          )
          .join(", ")}.`
      : "";

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
            data: { type: "object", properties: colProperties, required: [] },
          },
          required: ["id", "data"],
        },
      });

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

  const tableCount = new Set(
    tools
      .filter((t) => t.name !== "list_tables")
      .map((t) => t.name.replace(/^(query|create|update|delete)_/, "")),
  ).size;

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(tools, null, 2));

  console.log(`✓ tools.json written to ${OUTPUT_PATH}`);
  console.log(`  ${tableCount} tables → ${tools.length} tools generated`);
}

main();
