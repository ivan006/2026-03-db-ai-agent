# NLUI — Information Agent (IA)

## Connecting your database

The IA generates its tools from your Supabase database structure. You provide raw SQL exports, and the extractor builds the tools file automatically.

---

### 1. Create your tools-inputs folder

Copy the example folder:

```
src/components/chat/tools-inputs-example/  →  src/components/chat/tools-inputs/
```

This folder is gitignored. The example folder shows the expected structure and format for each file.

---

### 2. Populate tools-inputs

Run each of the following SQL queries in your **Supabase SQL Editor** and export the result as JSON into the corresponding file.

---

#### `tools-inputs/columns.json`

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

---

#### `tools-inputs/enums.json`

```sql
SELECT t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
ORDER BY t.typname, e.enumsortorder;
```

---

#### `tools-inputs/foreign_keys.json`

```sql
SELECT
  kcu.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
  ON kcu.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE kcu.table_schema = 'public';
```

---

#### `tools-inputs/policies.json`

```sql
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

---

### 3. Generate tools.json

```bash
node src/components/chat/extract-schema.js
```

This reads all four files from `tools-inputs/` and outputs `src/components/chat/tools.json` — the file the IA uses at runtime.

Re-run any time your database schema, relationships, enums, or policies change.
