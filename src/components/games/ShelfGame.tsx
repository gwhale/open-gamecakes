'use client';

// A game on the /play bakery shelf: a framed photo of the game standing on real
// wood, with a paper tag. A game with no cover shows its glyph instead, so a
// missing file never shows a broken image.

import Link from 'next/link';
import { useState } from 'react';

export default function ShelfGame({
  slug,
  label,
  glyph,
}: {
  slug: string;
  label: string;
  glyph: string;
}): React.ReactElement {
  const [coverOk, setCoverOk] = useState(true);
  return (
    <div className="flex h-full flex-col justify-end">
      <Link
        href={`/play/${slug}`}
        aria-label={`Play ${label}`}
        className="group mx-2 mb-0 block rounded-sm bg-[#fffdf8] p-1.5 shadow-[0_10px_16px_-6px_rgba(60,30,10,0.55)] transition-transform duration-150 ease-out hover:-translate-y-1.5 focus-visible:-translate-y-1.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-700 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:mx-3"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        <span className="block aspect-[16/10] overflow-hidden bg-amber-50">
          {coverOk ? (
            // Static files from /public, already sized; next/image would add a
            // server round trip per photo for nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/games/covers/${slug}.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setCoverOk(false)}
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden className="flex h-full w-full items-center justify-center text-5xl">
              {glyph}
            </span>
          )}
        </span>
        <span className="block px-1 pb-1 pt-2 text-center font-display text-sm font-semibold leading-tight text-[#3b2415] sm:text-base">
          {label}
        </span>
      </Link>
      {/* The shelf itself: planed wood with a shadow on the wall under it. */}
      <div
        aria-hidden
        className="h-4 w-full bg-cover bg-center shadow-[0_8px_10px_-2px_rgba(60,30,10,0.4)]"
        style={{ backgroundImage: 'url(/play/shelf-wood.jpg)' }}
      />
    </div>
  );
}
