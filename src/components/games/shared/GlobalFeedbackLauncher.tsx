'use client';

// GlobalFeedbackLauncher — floating 🧁 "Story Oven" button on every gated page.
//
// Why this exists:
//   Before this, the only way to pop something in the Story Oven was via the
//   small 🧁 button inside a game's header (see PhaserGameHost). Kids who
//   noticed an issue on the map, the tickets page, or elsewhere had no entry
//   point. This FAB fixes that — from any gated page they can tap it and add an
//   idea/bug/wish to the oven, picking which game it's about.
//
// Hide logic:
//   - Inside /games/[slug]: the in-game header button already exists and a
//     FAB at bottom-right would overlap game controls (e.g. Math Asteroids'
//     fire button). So we skip rendering here.
//   - Inside /parent: parent-admin UI, not a kid context.
//   - On /kids or /gate: kid-selection / auth flows.

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import FeedbackModal from './FeedbackModal';
import { findGame } from '@/lib/games/registry';

export default function GlobalFeedbackLauncher({
  kidName,
}: {
  kidName?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? '';

  // Routes where we should NOT render the FAB.
  if (pathname.startsWith('/games/')) return null;
  if (pathname.startsWith('/parent')) return null;
  if (pathname === '/kids' || pathname.startsWith('/kids/')) return null;
  if (pathname === '/gate') return null;

  // If we're somehow on a URL that references a known game slug, prefill.
  // (Defensive — today the pathname checks above already excluded /games/*,
  //  but if some future page takes a ?game= hint this pattern is ready.)
  const match = pathname.match(/\/games\/([^/]+)/);
  const prefillSlug = match ? findGame(match[1])?.slug : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Story Oven — pop in an idea, bug, or wish"
        title="Story Oven"
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16 sm:text-3xl"
        style={{
          minHeight: 'var(--min-tap-target)',
          background:
            'linear-gradient(135deg, var(--brand-strawberry, #fb7185), var(--brand-cherry, #dc2626))',
        }}
      >
        🧁
      </button>
      {open ? (
        <FeedbackModal
          gameSlug={prefillSlug}
          kidName={kidName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
