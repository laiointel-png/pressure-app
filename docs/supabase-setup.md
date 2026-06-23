# Supabase setup (MVP)

This repo ships as a static GitHub Pages app. To make it a real backend-backed product, Supabase is the simplest “free-first” path:

- Auth (magic link)
- Postgres persistence (groups/members/checkins/ledger)
- RLS policies (start permissive, tighten later)

## 1) Create Supabase project

In Supabase:

1. Create a new project.
2. Go to **SQL Editor** and run [`/Users/videomarketing1/Documents/FIN/supabase/schema.sql`](/Users/videomarketing1/Documents/FIN/supabase/schema.sql)
3. Go to **Authentication → URL Configuration** and add redirect URLs:
   - Local: `http://localhost:5173/#onboard`
   - GitHub Pages: `https://<username>.github.io/<repo>/#onboard`

## Optional: local Supabase via Docker

If you want a local stack (no cloud project yet), this repo includes a minimal compose file:

- [`/Users/videomarketing1/Documents/FIN/docker-compose.supabase.yml`](/Users/videomarketing1/Documents/FIN/docker-compose.supabase.yml)
- [`/Users/videomarketing1/Documents/FIN/supabase/kong.yml`](/Users/videomarketing1/Documents/FIN/supabase/kong.yml)

Run:

```bash
docker compose -f docker-compose.supabase.yml up -d
```

Then point the app to:

- `Supabase URL`: `http://localhost:54321`

This is dev-only and intentionally minimal; for a full local Supabase experience, the Supabase CLI is recommended.

## 2) Configure the app (onboarding)

Open the app and set:

- `Supabase URL` = your project URL
- `Supabase anon key` = your anon public key
- `Email` = your email, then click `Stuur magic link`

After you open the magic link on the same device, the session is stored and the app can write to Supabase tables.

## Notes

- This is MVP wiring; it keeps localStorage as the source of truth and does best-effort sync.
- For production, tighten RLS to only allow members to read/write their group rows, and stop using arbitrary `user_id` strings for identity.
