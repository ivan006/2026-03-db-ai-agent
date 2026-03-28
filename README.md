# NLUI — Information Agent (IA)

## Connecting your database

### 1. Open the Supabase SQL Editor

In your Supabase project, go to **SQL Editor** and run:

```sql
SELECT json_object_agg(table_name, columns)
FROM (
  SELECT
    table_name,
    json_agg(column_name::text ORDER BY ordinal_position) AS columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
  GROUP BY table_name
) t;
```

---

### 2. Copy the result

The query returns a single JSON object. Copy it.

It looks like this:

```json
{
  "users": ["id", "email", "created_at"],
  "posts": ["id", "title", "body", "user_id"]
}
```

---

### 3. Where to put it

Paste it into:

```
src/schema.json
```

This file is gitignored. See `src/schema.json.example` for the expected structure.
