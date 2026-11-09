// `/play/<slug>` — one game, anonymously.
//
// The page's only jobs are to refuse a slug the arcade does not offer and to
// pass the title through; GuestGameHost does the mounting. Keeping the
// not-found check here means an unknown or local slug 404s server-side rather
// than rendering a shell that fails in the browser.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { guestPlayableGames } from '@/lib/games/guest-mounts';
import GuestGameHost from '@/components/games/guest/GuestGameHost';

export const metadata: Metadata = {
  // Same reasoning as /play: shared by link, not found by search.
  robots: { index: false, follow: false },
};

/** Pre-render the tiles' targets. Derived from the same list the grid uses, so
 *  a game added to the table is reachable without touching this file. */
export function generateStaticParams() {
  return guestPlayableGames().map((g) => ({ slug: g.slug }));
}

export default async function PlayGamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // guestPlayableGames() is upstream-only and mount-table-only, so this also
  // refuses a family's own game rather than leaking one into the arcade.
  const game = guestPlayableGames().find((g) => g.slug === slug);
  if (!game) notFound();

  return <GuestGameHost slug={game.slug} title={game.label} />;
}
