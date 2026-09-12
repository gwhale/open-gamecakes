// `/kids` — kid-picker after login. The first screen a kid sees, so it
// has to feel like a treat shop, not a settings panel.
//
// Design choices (May 2026 makeover):
//   - Warm gradient backdrop (sky → amber → rose) instead of white-on-zinc.
//   - SprinkleDecor scatter in the viewport corners.
//   - Cakey greeter speech-bubble "Hi! Who's playing?" so the brand
//     mascot is present at first contact.
//   - Per-kid accent color so three plain cupcakes still read as three
//     distinct people. Guest is always amber (sandbox cue); other kids
//     hash to one of strawberry / mint / sky / pink — deterministic so
//     a kid's accent is stable across renders.
//   - Tile shadow + slight rotate on hover gives the candy-tap feel.
//
// Two paths depending on whether the kid has a PIN set:
//   - Kid with a PIN  → avatar is a <Link> to /kids/<id>, which opens the
//                        PIN-entry form. On successful PIN, /api/kids/select
//                        writes the active-kid cookie and bounces to /map.
//   - Kid with no PIN → avatar is an inline form-as-button that POSTs
//                        directly to /api/kids/select, skipping PIN entry.
//
// Zero client JS either way.

import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { isGuest } from '@/lib/auth/guest';
import { requireCurrentFamily } from '@/lib/auth/family';
import type { Kid } from '@/lib/types';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import { coerceCupcakeConfig } from '@/lib/cupcake/config';
import { SprinkleDecor } from '@/components/ui/SprinkleDecor';
import GamecakesMascot from '@/components/GamecakesMascot';

/** Per-kid accent palette. Guest is always amber (matches the
 *  sandbox visual cue). The other kids cycle through a 4-color
 *  palette in created_at order — index-based, not hash-based, so
 *  the first 4 kids in a family are guaranteed-distinct (avoids
 *  the collision a hash-mod-4 has on 1-in-4 of any pair). Falls
 *  back to repeating the palette for the 5th+ kid, where some
 *  collision is acceptable. */
const KID_PALETTE = [
  {
    bg: 'bg-rose-50 hover:bg-rose-100',
    ring: 'ring-rose-300',
    bar: 'from-rose-400 to-pink-500',
  },
  {
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    ring: 'ring-emerald-300',
    bar: 'from-emerald-400 to-teal-500',
  },
  {
    bg: 'bg-sky-50 hover:bg-sky-100',
    ring: 'ring-sky-300',
    bar: 'from-sky-400 to-blue-500',
  },
  {
    bg: 'bg-violet-50 hover:bg-violet-100',
    ring: 'ring-violet-300',
    bar: 'from-violet-400 to-purple-500',
  },
] as const;

const GUEST_ACCENT = {
  bg: 'bg-amber-50 hover:bg-amber-100',
  ring: 'ring-amber-300',
  bar: 'from-amber-400 to-orange-500',
} as const;

function accentForKid(
  kid: Pick<Kid, 'id'>,
  index: number,
): { bg: string; ring: string; bar: string } {
  if (isGuest(kid.id)) return GUEST_ACCENT;
  return KID_PALETTE[index % KID_PALETTE.length];
}

export default async function KidsPage(): Promise<React.ReactElement> {
  // Family-scoped: only show kids that belong to the current parent's family.
  // The (gated) layout already validated the session; this is the data scope.
  const family = await requireCurrentFamily();
  const { data, error } = await supabaseServer()
    .from('kids')
    .select('id, name, avatar, pin, cupcake_config')
    .eq('family_id', family.id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load kids: ${error.message}`);
  }

  // Sort real kids first, sandbox (Guest) last — identified by well-known UUID.
  const kids = ((data ?? []) as Pick<Kid, 'id' | 'name' | 'avatar' | 'pin' | 'cupcake_config'>[])
    .slice()
    .sort((a, b) => Number(isGuest(a.id)) - Number(isGuest(b.id)));

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden bg-gradient-to-br from-sky-100 via-amber-50 to-rose-100 p-8 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <SprinkleDecor density="scatter" />

      {/* Cakey greeter — speech-bubble welcome. The real mascot (not a
          placeholder emoji) is at first contact so the brand voice frames
          the picker, not the picker alone. Cakey waves hello. */}
      <div className="relative z-10 flex items-end gap-3">
        <GamecakesMascot mood="wave" size={112} className="drop-shadow-md" />
        <div className="relative -mb-2 max-w-[18rem] rounded-2xl border-2 border-rose-200 bg-white px-5 py-3 shadow-lg">
          {/* Speech-bubble tail */}
          <span
            aria-hidden
            className="absolute -left-2 bottom-4 h-4 w-4 rotate-45 border-b-2 border-l-2 border-rose-200 bg-white"
          />
          <p className="font-display text-base font-medium leading-snug text-zinc-800">
            Hi! Who&rsquo;s playing today?
          </p>
        </div>
      </div>

      <ul className="relative z-10 grid grid-cols-2 gap-6 sm:gap-10">
        {kids.map((kid, i) => {
          // Guest doesn't consume a palette slot — every real kid before
          // it gets the canonical index, so 2 real kids = rose+emerald,
          // 3 real kids = rose+emerald+sky, etc.
          const accent = accentForKid(kid, i);
          const guest = isGuest(kid.id);
          const tileBase = [
            'group relative flex flex-col items-center gap-4 rounded-3xl px-8 py-8',
            'text-center shadow-md transition-all duration-150',
            'hover:shadow-xl hover:-translate-y-0.5 active:scale-95',
            'ring-4 ring-transparent hover:ring-offset-2',
            `hover:${accent.ring}`,
            accent.bg,
            'dark:bg-zinc-900 dark:hover:bg-zinc-800',
          ].join(' ');
          return (
            <li key={kid.id}>
              {kid.pin ? (
                <Link
                  href={`/kids/${kid.id}`}
                  className={tileBase}
                  style={{
                    minWidth: 'var(--min-tap-target)',
                    minHeight: 'var(--min-tap-target)',
                  }}
                >
                  <CupcakeAvatar
                    config={coerceCupcakeConfig(kid.cupcake_config)}
                    size={108}
                  />
                  <span className="font-display text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
                    {kid.name}
                  </span>
                  {/* Accent bar at the bottom of the tile — the per-kid
                      color signature so three plain cupcakes still
                      read as three people. */}
                  <span
                    aria-hidden
                    className={`mt-1 h-1.5 w-16 rounded-full bg-gradient-to-r ${accent.bar}`}
                  />
                </Link>
              ) : (
                <form action="/api/kids/select" method="post">
                  <input type="hidden" name="kidId" value={kid.id} />
                  <button
                    type="submit"
                    className={tileBase}
                    style={{
                      minWidth: 'var(--min-tap-target)',
                      minHeight: 'var(--min-tap-target)',
                    }}
                  >
                    <CupcakeAvatar
                      config={coerceCupcakeConfig(kid.cupcake_config)}
                      size={108}
                    />
                    <span className="font-display text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
                      {kid.name}
                    </span>
                    <span
                      aria-hidden
                      className={`mt-1 h-1.5 w-16 rounded-full bg-gradient-to-r ${accent.bar}`}
                    />
                    {guest ? (
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
                        Sandbox
                      </span>
                    ) : null}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
