# Priority

A small shared list. Add, edit, delete, and drag items to reorder them. The order is saved in Supabase.

## Local setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the project URL and **publishable** key.
3. Run `npm install` then `npm run dev`.

This is intentionally a public shared list: anyone with the site URL can change its contents. Never put a Supabase secret or service role key in a `VITE_` variable.
