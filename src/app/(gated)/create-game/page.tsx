import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import CreateGameFlow from '@/components/create-game/CreateGameFlow';

export default async function CreateGamePage() {
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
