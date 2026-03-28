# NLUI — Information Agent (IA)

## Connecting your database

### 1. Login to Supabase CLI

```bash
npx supabase login
```

This opens a browser window. Log in and paste the verification code back in the terminal.

---

### 2. Export your schema

```bash
npx supabase gen types typescript --project-id your-project-id
```

Find your project ID in the Supabase dashboard under **Project Settings → General → Project ID**.

---

### 3. What to extract

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

---

### 4. Where to put it

Paste it into:

```
src/schema.js
```

This file is gitignored. See `src/schema.js.example` for the expected structure.
