// Family-scope helpers for the multi-family auth model.
//
// "Family" is the unit of data isolation. Once Phase 2 RLS policies are
// in place, every kid / attempt / kid_skill / feedback / observation
// row is owned by exactly one family, and a parent can only access
// rows owned by the family they own (families.owner_user_id = their
// auth.users.id).
//
// In Phase 1 the existing routes still use the SITE_PASSWORD gate and
// don't yet know about families. These helpers exist so the new
// /signup, /login, and (future) family-aware /parent route can resolve
// the current parent's family.

import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/supabase/session';

export interface Family {
  id: string;
  name: string;
  owner_user_id: string | null;
  created_at: string;
}

/**
 * Resolve the family currently owned by the logged-in parent.
 * Returns null if no session, or if the user has not yet been linked
 * to a family (an edge case during signup before the family row is
 * inserted/claimed).
 *
 * MEMOIZED per render pass, same reasoning as getCurrentUser: eleven call
 * sites reach for the family, and nested layouts mean several of them fire in
 * ONE request. Deduping the lookup is free and invisible to callers.
 */
export const getCurrentFamily = cache(async (): Promise<Family | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const sb = supabaseServer();
  const { data, error } = await sb
    .from('families')
    .select('id, name, owner_user_id, created_at')
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Family;
});

/**
 * Server-component guard: redirect to /login if no session, or to a
 * "claim your family" page if the session exists but no family is
 * linked yet (shouldn't happen in normal flow but is recoverable).
 */
export async function requireCurrentFamily(): Promise<Family> {
  const fam = await getCurrentFamily();
  if (fam) return fam;
  const { redirect } = await import('next/navigation');
  redirect('/login');
  // redirect() throws to perform the navigation; this throw is just to
  // satisfy TS that this codepath doesn't fall through.
  throw new Error('unreachable: redirect should have thrown');
}
