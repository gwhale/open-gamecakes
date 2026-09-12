// Server-side Supabase client.
//
// IMPORTANT: This file MUST NEVER be imported from a Client Component or any
// code that ships to the browser. It holds the secret key (SUPABASE_SECRET_KEY,
// formerly "service role key"), which bypasses RLS and can read/write anything
// in the database. Importing it client-side would leak the secret into the
// JavaScript bundle.
//
// Next.js's convention for preventing that is the `server-only` package, which
// throws at build time if imported from a client module. We don't have it
// installed yet, so for Phase 1 this is a discipline thing: only import from
// /api/* route handlers and Server Components that never serialize state to
// the client. Add `server-only` as a dep if we ever start accidentally leaking
// server modules into the client bundle.
//
// The client is lazily constructed on first call and memoized for the
// process lifetime. That matters on Vercel: Next.js's build step imports
// every route handler and server component to analyze the route tree,
// and any module-scope `createClient(...)` call would run BEFORE Vercel
// injects the production env vars. Wrapping construction in a function
// moves the env var read and the createClient() call out of import time
// and into first-call time, so the build passes without env vars and the
// actual error (if any) surfaces at request time with the same clear
// message.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function buildServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');

  return createClient(url, secret, {
    auth: {
      // No sessions on the server — we authenticate via the secret key header.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let cachedServer: SupabaseClient | null = null;

/**
 * Lazily returns a process-wide singleton Supabase server client.
 * Safe to call from the top of any route handler or server component body.
 * Do NOT call at module scope — defeats the whole point of this file.
 */
export function supabaseServer(): SupabaseClient {
  if (cachedServer) return cachedServer;
  cachedServer = buildServerClient();
  return cachedServer;
}
