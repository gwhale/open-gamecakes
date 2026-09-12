// /town/deep — the Sunken Batterlands, the ocean under Gamecakes Island.
//
// A sibling of /town rather than a mode inside it: the deep runs its own engine
// (src/lib/deep/engine.ts) in metres, and the town's is already ~4,900 lines.
// Reaching it is the same save-then-navigate contract a game booth uses, so
// surfacing puts the cupcake back on the jetty it left from.
//
// Authentication piggybacks on the (gated) layout — every page in this group
// already requires a logged-in family. The active kid is re-resolved here
// because Server Components do not share state with the layout above them.
//
// ACCESS. The dive is gated by Caramel Cove, and by nothing else. The cove is
// a DEEP-tier land the kid has to buy like any other, its landmark has been an
// anchor since before this existed, and the submarine is only built in the town
// scene once the cove is discovered. So there is one gate, in one place, and a
// kid who deep-links here without the cove is sent back to the town rather than
// dropped into an ocean with no way home.

import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { isGuest } from '@/lib/auth/guest';
import { SUB_DOCK_REGION } from '@/lib/town/three/sub-dock';
import DeepHost from '@/components/deep/DeepHost';
import { pickDeepSpawn, type SavedDeepState } from '@/lib/deep/resume';

export default async function DeepPage(): Promise<React.ReactElement> {
  const kidId = await getActiveKid();
  if (!kidId) redirect('/kids');

  // The guest sandbox dives too, and starts every dive fresh.
  //
  // It used to be turned away here, on the reasoning that the cove is not a
  // starter land so a guest could never have unlocked it. The sandbox now owns
  // every land (town/page.tsx), which makes the submarine appear on the jetty —
  // and a submarine you can board and then get bounced out of is worse than no
  // submarine at all.
  //
  // Nothing persists: no kid_deep_state to resume from, no discoveries, no best
  // depth. That is the same bargain the rest of the sandbox strikes, and it
  // means the descent — the best thirty seconds in the feature — is what a
  // guest gets EVERY time rather than being resumed past.
  if (isGuest(kidId)) {
    return <DeepHost found={[]} bestDepthM={0} />;
  }

  const sb = supabaseServer();

  // One query, not two. Whether the kid still exists is not worth asking
  // separately — a discovery row for them IS the answer, and it is the row the
  // gate needs anyway.
  const { data: discovery } = await sb
    .from('kid_region_discoveries')
    .select('region_slug')
    .eq('kid_id', kidId)
    .eq('region_slug', SUB_DOCK_REGION)
    .maybeSingle();
  if (!discovery) redirect('/town');

  // What the ocean remembers about this kid. All of it is OPTIONAL: every query
  // below degrades to "start fresh at the reef" rather than failing the page,
  // because a dive that forgets is a disappointment and a dive that 500s is a
  // broken game. That also means the feature works before migration 0053 has
  // been applied — persistence is simply absent until the tables exist.
  const [{ data: state }, { data: finds }] = await Promise.all([
    sb
      .from('kid_deep_state')
      .select('x, y, z, heading, deepest_m, updated_at')
      .eq('kid_id', kidId)
      .maybeSingle<SavedDeepState & { deepest_m: number }>(),
    sb
      .from('kid_deep_discoveries')
      .select('landmark_slug')
      .eq('kid_id', kidId),
  ]);

  return (
    <DeepHost
      spawn={pickDeepSpawn(state)}
      found={(finds ?? []).map((r) => r.landmark_slug as string)}
      bestDepthM={state?.deepest_m ?? 0}
    />
  );
}
