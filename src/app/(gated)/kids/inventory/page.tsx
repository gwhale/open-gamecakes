// `/kids/inventory` — everything this kid has collected.
//
// Server component, same shape as kids/customize: resolve the active kid from
// the cookie, read their rows, hand a plain list to presentational cards. Auth
// piggybacks on the (gated) layout; no active kid means bounce to /kids.
//
// What is drawn and what the score reads is decided by collectionView(), not
// here — it is a rule about what a kid is allowed to know, and it is tested.

import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { collectionView } from '@/lib/items/collection';
import ItemCard from '@/components/items/ItemCard';
import FullscreenToggle from '@/components/FullscreenToggle';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';

interface ItemRow {
  item_slug: string;
  found_at: string;
}

export default async function InventoryPage(): Promise<React.ReactElement> {
  const kidId = await getActiveKid();
  if (!kidId) redirect('/kids');

  // A guest can never hold an item — the sandbox writes nothing — so skip the
  // query rather than sending a well-known fake uuid at the database. They
  // still get the page, and the silhouettes are the point of showing it.
  let rows: ItemRow[] = [];
  if (!isGuest(kidId)) {
    const { data } = await supabaseServer()
      .from('kid_items')
      .select('item_slug, found_at')
      .eq('kid_id', kidId);
    rows = (data ?? []) as ItemRow[];
  }

  const { entries, foundCount, total, complete } = collectionView(
    new Map(rows.map((r) => [r.item_slug, r.found_at])),
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-sky-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      {/* Compact chrome on purpose: this is a panel of the Cakey Store, reached
          from its nav corner and from the backpack beside the town wallet, not
          a landing page a kid navigates to on its own. The logo and the big
          title it used to carry cost a third of an iPad screen before a single
          item showed. */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-lg font-bold sm:text-xl">
            <span className="mr-1.5" aria-hidden>🎒</span>
            Your Collection
          </h1>
          <p className="text-xs text-zinc-500">
            {foundCount === 0
              ? 'Nothing yet. There are things out there.'
              : `${foundCount} of ${total}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <FullscreenToggle size="sm" />
          <ChromeNavLink href="/kids/customize" variant="light" size="sm">
            ← Store
          </ChromeNavLink>
        </div>
      </header>

      <section className="px-4 pb-4 sm:px-6">
        <ul className="mx-auto grid max-w-2xl grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
          {entries.map(({ item, foundAt }) => (
            <ItemCard
              key={item.slug}
              item={item}
              found={foundAt ? { foundAt } : null}
            />
          ))}
        </ul>
      </section>

      <footer className="px-4 pb-5 text-center sm:px-6">
        <p className="text-xs text-zinc-500">
          {complete
            ? 'That is all of them. For now.'
            : 'Baking things keep turning up in strange places.'}
        </p>
      </footer>
    </main>
  );
}
