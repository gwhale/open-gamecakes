import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { requireCurrentFamily } from '@/lib/auth/family';
import { can } from '@/lib/auth/tier';
import { supabaseServer } from '@/lib/supabase/server';
import CreateGameFlow from '@/components/create-game/CreateGameFlow';

export default async function CreateGamePage() {
  // Bounce before the flow starts rather than letting a kid draw a whole game
  // and hit a 403 on the upload at the end.
  const family = await requireCurrentFamily();
  if (!can(family.tier, 'game:create')) redirect('/town');

  const activeKid = await getActiveKid();
  if (!activeKid) redirect('/kids');

  const { data: kid } = await supabaseServer()
    .from('kids')
    .select('name, avatar')
    .eq('id', activeKid)
    .maybeSingle();

  return (
    <CreateGameFlow
      kidName={kid?.name ?? 'friend'}
      avatar={kid?.avatar ?? '🎮'}
    />
  );
}
