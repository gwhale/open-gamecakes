// Browser Supabase client.
//
// Uses the PUBLISHABLE key (sb_publishable_...), which is safe to ship to the
// browser. This client is subject to RLS — in Phase 1 we have RLS disabled on
// every table, so this client is intentionally limited: only use it for
// read-only queries where we don't mind the browser seeing everything, or for
// trivial selects like "list kids to render the profile grid." All writes go
// through /api/* route handlers that use the server client.
//
// When we enable RLS (Phase 2+), this client becomes the primary path for
// reads and we'll gate it with per-kid / per-parent policies.
//
// As with server.ts, the client is lazily constructed on first call and
// memoized. Even though NEXT_PUBLIC_* env vars are inlined at build time by
// Next.js, they're only inlined IF they're set in the Vercel project's env
// vars — same build-time failure mode applies until they are. Lazy init
// keeps the build independent of env var presence.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function buildBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!publishable) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');

  return createClient(url, publishable, {
    auth: {
      // We don't use Supabase Auth — there are no sessions to persist.
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      // Town multiplayer (see src/lib/realtime/town-channel.ts) broadcasts
      // position at ~8 Hz plus the occasional emote. The client default caps
      // outbound Realtime messages at 10/sec, which leaves too little emote
      // headroom on top of an 8 Hz position stream; 15/sec gives comfortable
      // slack. Harmless when Realtime is unused (this is the only feature that
      // opens a channel today).
      params: { eventsPerSecond: 15 },
    },
  });
}

let cachedBrowser: SupabaseClient | null = null;

/**
 * Lazily returns a singleton browser-side Supabase client.
 * Uses the publishable key — safe to call from Client Components.
 */
export function supabaseBrowser(): SupabaseClient {
  if (cachedBrowser) return cachedBrowser;
  cachedBrowser = buildBrowserClient();
  return cachedBrowser;
}
