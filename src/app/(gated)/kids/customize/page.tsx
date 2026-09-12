// /kids/customize — the cupcake customization shop.
//
// Server component: fetches the active kid's current cupcake_config,
// their unlocks, and their wallet balance, then renders the
// CustomizeShop client component which handles tabs + live preview +
// unlock + apply.
//
// Auth: piggybacks on the (gated) layout. The active-kid cookie tells
// us whose cupcake we're customizing; if there's no active kid we
// bounce to /kids to pick one.

import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import {
  type CupcakeConfig,
  coerceCupcakeConfig,
} from '@/lib/cupcake/config';
import CustomizeShop from '@/components/cupcake/CustomizeShop';
import { REGIONS } from '@/lib/town/regions';
import { isVehicleKind, type VehicleKind } from '@/lib/town/vehicles';
import { clampLandLevel } from '@/lib/town/land-evolution';
import { subjectProgress } from '@/lib/mastery/subject-progress';
import type { Subject } from '@/lib/types';
import type { LedgerRow } from '@/components/cupcake/KidProfilePanel';

interface UnlockRow {
  kind: 'wrapper' | 'frosting' | 'topping' | 'variety';
  value: string;
}

interface SkillRow {
  id: string;
  subject: Subject;
  on_track_tier: number | null;
}

interface KidSkillRow {
  skill_id: string;
  current_tier: number;
  total_attempts: number;
}

export default async function CustomizePage(): Promise<React.ReactElement> {
  const kidId = await getActiveKid();
  if (!kidId) redirect('/kids');

  const sb = supabaseServer();

  const [kidRes, unlocksRes, walletRes, txRes, skillsRes, kidSkillsRes] = await Promise.all([
    sb.from('kids').select('id, name, land_slug, cupcake_config').eq('id', kidId!).maybeSingle(),
    sb.from('kid_cupcake_unlocks').select('kind, value').eq('kid_id', kidId!),
    sb.from('kid_tokens').select('balance, total_earned, total_spent').eq('kid_id', kidId!).maybeSingle(),
    sb.from('token_transactions')
      .select('id, delta, reason, metadata, created_at')
      .eq('kid_id', kidId!)
      .order('created_at', { ascending: false })
      .limit(12),
    sb.from('skills').select('id, subject, on_track_tier'),
    sb.from('kid_skills').select('skill_id, current_tier, total_attempts').eq('kid_id', kidId!),
  ]);

  const kid = kidRes.data as { id: string; name: string; land_slug: string | null; cupcake_config: unknown } | null;
  if (!kid) redirect('/kids');

  const guest = isGuest(kid!.id);
  const config: CupcakeConfig = coerceCupcakeConfig(kid!.cupcake_config);
  const unlocks = (unlocksRes.data ?? []) as UnlockRow[];

  const wallet = {
    balance: (walletRes.data?.balance as number | undefined) ?? 0,
    totalEarned: (walletRes.data?.total_earned as number | undefined) ?? 0,
    totalSpent: (walletRes.data?.total_spent as number | undefined) ?? 0,
    recent: (txRes.data ?? []) as LedgerRow[],
  };

  const skills = (skillsRes.data ?? []) as SkillRow[];
  const kidSkills = (kidSkillsRes.data ?? []) as KidSkillRow[];
  const progress = {
    math: subjectProgress('math', skills, kidSkills),
    reading: subjectProgress('reading', skills, kidSkills),
  };

  // The land this kid owns (kids.land_slug — DB-driven, see migration 0043)
  // + its evolution level — for the Cakey Store "My Land" section. Owner-only;
  // guests own nothing.
  const ownedRegion = guest
    ? undefined
    : REGIONS.find((r) => r.kidLand && r.slug === (kid!.land_slug ?? null));
  let ownedLand: { slug: string; name: string; level: number } | null = null;
  if (ownedRegion) {
    const landRes = await sb
      .from('kid_region_discoveries')
      .select('level')
      .eq('kid_id', kidId!)
      .eq('region_slug', ownedRegion.slug)
      .maybeSingle();
    ownedLand = {
      slug: ownedRegion.slug,
      name: ownedRegion.name,
      level: clampLandLevel(landRes.data?.level),
    };
  }

  // Active (non-expired) vehicle rentals — seeds the Cakey Garage panel's
  // "Rented" state so a ride bought in Town already reads as owned here.
  const rentals: VehicleKind[] = guest
    ? []
    : (
        (
          await sb
            .from('kid_vehicle_rentals')
            .select('vehicle_kind')
            .eq('kid_id', kidId!)
            .gt('expires_at', new Date().toISOString())
        ).data ?? []
      )
        .map((r) => r.vehicle_kind as string)
        .filter(isVehicleKind);

  return (
    <CustomizeShop
      kidName={kid!.name}
      initialConfig={config}
      initialUnlocks={unlocks}
      initialBalance={wallet.balance}
      wallet={wallet}
      progress={progress}
      isGuest={guest}
      ownedLand={ownedLand}
      rentals={rentals}
    />
  );
}
