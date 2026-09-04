// POST /api/town/rent-vehicle — rent a cake-themed ride for the day.
//
// Body: { vehicle_kind: 'skateboard' | 'jeep' | 'biplane' | 'balloon' }
//
// Auth: requireSessionOrJson (parent cookie) + active kid cookie; the kid must
// belong to the current family. Mirrors /api/town/clear-storm's ad-hoc spend,
// but the debit + the time-bound rental row are written together by the atomic
// rent_vehicle RPC (0029) so we can never charge without granting the rental.
//
// The cost is looked up server-side from the vehicle catalog (never trusted
// from the client), and the expiry (next UTC midnight) is computed inside the
// RPC. Renting a ride you already hold a valid rental for is free and idempotent
// ('already_rented'). Guests have no real wallet, so they ride free (the client
// tracks their rentals locally) — mirrors clear-storm / discover.

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { findVehicle, isVehicleKind } from '@/lib/town/vehicles';

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const kind =
    body && typeof body === 'object' ? (body as { vehicle_kind?: unknown }).vehicle_kind : null;
  if (!isVehicleKind(kind)) {
    return Response.json({ error: 'invalid vehicle_kind' }, { status: 400 });
  }
  const cost = findVehicle(kind)!.cost;

  // Guest sandbox has no real wallet — ride free (client tracks it locally).
  if (isGuest(kidId)) {
    return Response.json({ balance: 0, rented: true, vehicle_kind: kind });
  }

  const sb = supabaseServer();

  // Family-scope check — kid must belong to this parent's family.
  const { data: kid } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kid) {
    return Response.json({ error: 'kid not in family' }, { status: 403 });
  }

  // Atomic debit + rental upsert (0029). The RPC does the balance check and
  // returns a status so a partial write can't happen.
  const { data, error } = await sb.rpc('rent_vehicle', {
    p_kid: kidId,
    p_family: family.id,
    p_vehicle_kind: kind,
    p_cost: cost,
  });
  if (error) {
    return Response.json({ error: `rent_failed: ${error.message}` }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { balance: number; expires_at: string | null; status: string }
    | undefined;
  const status = row?.status ?? 'rent_failed';

  if (status === 'insufficient_balance') {
    return Response.json(
      { error: 'insufficient_balance', balance: row?.balance ?? 0, cost },
      { status: 400 },
    );
  }
  if (status !== 'rented' && status !== 'already_rented') {
    return Response.json({ error: status }, { status: 400 });
  }

  return Response.json({
    balance: row?.balance ?? 0,
    expires_at: row?.expires_at ?? null,
    vehicle_kind: kind,
    rented: true,
    already: status === 'already_rented',
  });
}
