# NLUI — Information Agent (IA)

## Connecting your database

### 1. Export your Supabase types

In your Supabase project dashboard, go to **Project Settings → General** to find your project ID, then run:

```bash
npx supabase gen types typescript --project-id your-project-id
```

---

### 2. Copy the Database type

From the output, copy only the `Database` type object — everything from `export type Database = {` to its closing `}`.

It looks like this:

```typescript
export type Database = {
  public: {
    Tables: {
      your_table: {
        Row: { ... }
        Insert: { ... }
        Update: { ... }
      }
    }
    ...
  }
}
```

Paste it into:

```
src/components/chat/raw-schema.ts
```

This file is gitignored.

---

### 3. Generate schema.json

```bash
node src/components/chat/extract-schema.js src/components/chat/raw-schema.ts
```

This reads `raw-schema.ts` and outputs `src/components/chat/schema.json` — the file the IA uses at runtime. Re-run this any time your database schema changes.
