// Supabase session helpers — App Router-safe.
//
// Three layers of Supabase clients in this codebase:
//   1. browser.ts        — publishable key, no auth, RLS-respecting reads
//   2. server.ts         — secret key, bypasses RLS, used by /api/* routes
//   3. session.ts (this) — auth-aware server client built per-request from
//                          the user's cookies. Calls auth.getUser() to
//                          identify the parent and applies RLS as that user.
//
// The new multi-family auth (Phase 1) uses (3) for read paths that must
// respect family-scoping. (2) is still the right tool for invite-code
// validation, kid mutations, and any flow that needs to act with admin
// privileges regardless of the requesting parent's permissions.

import { cache } from 'react';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Build a per-request Supabase client tied to the current user's session.
 * Reads/writes through this client respect RLS — the parent will only
 * see their own family's rows once Phase 2 RLS policies are in place.
 *
 * Must be called from a Server Component, Server Action, or Route
 * Handler — anywhere `cookies()` is available.
 */
export async function supabaseSession(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!publishable) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');

  const store = await cookies();

  return createServerClient(url, publishable, {
    cookies: {
      getAll() {
        return store.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        // Setting cookies is only allowed from Route Handlers and Server
        // Actions. In Server Components this throws, but createServerClient
        // tolerates the throw — it just means the refresh token isn't
        // rotated for that read. That's fine; the next mutating action
        // will rotate it.
        try {
          for (const c of cookiesToSet) {
            // Persist auth cookies for 400 days — the practical browser
            // maximum (RFC 6265bis cap). Without this, @supabase/ssr's
            // default short-lived access-token cookies expire on browser
            // restart and the kid has to log in again. Refresh-token
            // validity is still gated by Supabase's server-side session
            // settings; this just keeps the cookie envelope alive.
            // Tested on iPad PWA standalone — survives app force-quit
            // and OS restart.
            store.set(c.name, c.value, {
              ...c.options,
              maxAge: 60 * 60 * 24 * 400,
            });
          }
        } catch {
          // Server Component context — silently swallow. See comment above.
        }
      },
    },
  });
}

/**
 * Read the current user from the session cookies. Returns the auth.users
 * row's id + email, or null if no session.
 *
 * IMPORTANT: this calls auth.getUser() rather than auth.getSession()
 * because getUser() validates the JWT against Supabase Auth's signing
 * key — getSession() trusts the cookie blindly. For server-side identity
 * checks, always go through getUser().
 *
 * MEMOIZED per render pass with React's cache(). getUser() is a NETWORK call
 * to Supabase Auth on every invocation — it has to be, since validating the
 * JWT is the whole point — and the gated layout, a nested layout and the page
 * inside it each ask for the user independently. On /parent that was three
 * separate round trips to the auth server before any of the page's own data
 * started loading. cache() collapses them to one without changing a single
 * call site or weakening the check: same request, same cookies, same answer.
 * This is what the Next.js authentication guide prescribes
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md).
 */
export const getCurrentUser = cache(
  async (): Promise<{ id: string; email: string | null } | null> => {
    const sb = await supabaseSession();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
);
