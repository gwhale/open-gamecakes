// Route group `(gated)` — every page inside this folder requires a logged-in
// parent (multi-family auth Phase 2). `requireCurrentFamily` redirects to
// `/login` if there's no Supabase session, or if the session exists but no
// family row is owned by that user.
//
// `/login`, `/signup`, and `/auth/callback` live OUTSIDE this group so an
// unauthenticated visitor can actually reach the auth flow without being
// redirected in a loop.
//
// The /parent subtree previously had an additional parent-admin password
// gate. As of Phase 2 that's gone — owning the family IS the parent-admin
// check, so /parent only needs the same Supabase session check that every
// other gated page does.

import { requireCurrentFamily } from '@/lib/auth/family';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import GlobalFeedbackLauncher from '@/components/games/shared/GlobalFeedbackLauncher';

export default async function GatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const family = await requireCurrentFamily();

  // Look up the active kid's display name once so the global feedback FAB
  // can pass it into the AI summarizer for better ticket personalization.
  // Family-scoped: the kid must belong to the current parent's family,
  // otherwise we ignore the cookie (likely stale from a different family).
  const kidId = await getActiveKid();
  let kidName: string | undefined;
  if (kidId) {
    const sb = supabaseServer();
    const { data } = await sb
      .from('kids')
      .select('name, family_id')
      .eq('id', kidId)
      .eq('family_id', family.id)
      .maybeSingle();
    // The active-kid cookie is unsigned. If it points at a kid that is NOT in
    // this family (stale cookie from a previous login, or a forged one), do not
    // let any child page render with it — bounce to clear it. This layout runs
    // before the child pages read the cookie, so it protects every gated read
    // page (games, customize, tickets, town) in one place.
    if (!data) {
      const { redirect } = await import('next/navigation');
      redirect('/api/kids/clear-stale');
    }
    kidName = (data?.name as string | undefined) ?? undefined;
  }

  return (
    <>
      {children}
      <GlobalFeedbackLauncher kidName={kidName} />
    </>
  );
}
