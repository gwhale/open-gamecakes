# Supabase Storage bucket setup

Supabase Storage buckets are not managed by SQL migration files — they
live in the `storage.buckets` table (internal to the `storage` schema)
and should be created via the Supabase dashboard, the Supabase CLI, or
a direct SQL insert on `storage.buckets`.

For this project we use the Management API's `/database/query` endpoint
(same path as regular migrations) to insert directly into
`storage.buckets`. This is reproducible and version-controlled here.

## Current buckets

### `observations` (private)

Stores photos parents upload to create observations — homework pages,
writing samples, etc. Private visibility means server-side code (using
`SUPABASE_SECRET_KEY`) is the only way to read/write. Client code gets
signed URLs when it needs to display a photo.

Created via:

```bash
curl -X POST "https://api.supabase.com/v1/projects/<your-project-ref>/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"insert into storage.buckets (id, name, public) values ('"'"'observations'"'"', '"'"'observations'"'"', false) on conflict (id) do nothing"}'
```

## Why not RLS policies on storage.objects?

Phase 1 has RLS disabled across all tables (including `storage.objects`
implicitly — nothing in this project's app code touches Storage except
through the service-role server client, which bypasses RLS). When we
enable RLS in Phase 2+ we'll add per-bucket policies at that time. For
now, "only the server can write" is enforced by the service key living
only in the server process.
