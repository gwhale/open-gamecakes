'use client';

// A game as a recipe book on the All Games bakery shelf: a cloth cover with a
// spine, the game's screenshot pasted on like a photo, and its name on a label.
//
// Covers live at /games/covers/<slug>.jpg, captured from the game itself. A
// game without one (a new game, or a fork that never captured covers) shows its
// glyph on the photo instead, so a missing file never shows a broken image.

import Link from 'next/link';
import { useState } from 'react';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

/** Cover cloth colours, picked by slug so a book keeps its colour. */
const CLOTHS = [
  { cover: '#f9a8d4', spine: '#db2777' }, // strawberry
  { cover: '#93c5fd', spine: '#2563eb' }, // blueberry
  { cover: '#86efac', spine: '#16a34a' }, // mint
  { cover: '#fcd34d', spine: '#d97706' }, // lemon
  { cover: '#c4b5fd', spine: '#7c3aed' }, // grape
  { cover: '#fdba74', spine: '#ea580c' }, // orange
] as const;

function clothFor(slug: string): (typeof CLOTHS)[number] {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return CLOTHS[Math.abs(h) % CLOTHS.length];
}

export interface RecipeBookProps {
  slug: string;
  label: string;
  glyph: string;
  href: string;
  /** 'lg' for the specials carousel, 'sm' for the shelves. */
  size: 'lg' | 'sm';
  /** Unlock price when this kid has not bought the game yet. */
  lockedCost?: number;
  retired?: boolean;
}

export default function RecipeBook({
  slug,
  label,
  glyph,
  href,
  size,
  lockedCost,
  retired = false,
}: RecipeBookProps): React.ReactElement {
  const [coverOk, setCoverOk] = useState(true);
  const cloth = clothFor(slug);
  const lg = size === 'lg';
  return (
    <Link
      href={href}
      aria-label={
        retired
          ? `Play ${label} (retired)`
          : lockedCost !== undefined
            ? `Unlock ${label} for ${lockedCost} Sugar Tokens`
            : `Play ${label}`
      }
      className={
        'group relative block shrink-0 snap-start rounded-r-2xl rounded-l-md shadow-[4px_6px_0_rgba(120,53,15,0.25)] transition-transform duration-150 ease-out hover:-translate-y-1.5 hover:-rotate-1 focus-visible:-translate-y-1.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:rotate-0 ' +
        (lg ? 'w-60 sm:w-72' : 'w-full') +
        (retired ? ' opacity-60 grayscale hover:opacity-100' : '')
      }
      style={{ backgroundColor: cloth.cover }}
    >
      {/* Spine: a darker band with stitching, down the left edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-3 rounded-l-md sm:w-4"
        style={{
          backgroundColor: cloth.spine,
          backgroundImage:
            'repeating-linear-gradient(180deg, transparent 0 7px, rgba(255,255,255,0.55) 7px 11px)',
          backgroundSize: '2px 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <span className={'flex flex-col gap-2 pl-5 sm:pl-6 ' + (lg ? 'p-4' : 'p-2.5')}>
        {/* The photo pasted on the cover. */}
        <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-white p-1 shadow-sm">
          {coverOk ? (
            // Static files from /public, already sized; next/image would add a
            // server round trip per book for nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/games/covers/${slug}.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setCoverOk(false)}
              className="h-full w-full rounded-md object-cover"
            />
          ) : (
            <span
              aria-hidden
              className={
                'flex h-full w-full items-center justify-center rounded-md bg-amber-50 ' +
                (lg ? 'text-6xl' : 'text-4xl')
              }
            >
              {glyph}
            </span>
          )}
        </span>
        {/* Title label: a cream card with the glyph as its stamp. */}
        <span
          className={
            'flex items-center gap-1.5 rounded-md bg-amber-50/95 font-display font-bold leading-tight text-amber-950 ' +
            (lg ? 'min-h-12 px-3 py-2 text-lg' : 'min-h-10 px-2 py-1.5 text-sm')
          }
        >
          <span aria-hidden className={lg ? 'text-2xl' : 'text-lg'}>
            {glyph}
          </span>
          <span className="line-clamp-2">{label}</span>
        </span>
      </span>
      {retired && (
        <span className="absolute right-2 top-2 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
          Retired
        </span>
      )}
      {lockedCost !== undefined && !retired && (
        <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 shadow-sm">
          <span aria-hidden>🔒</span>
          <SugarTokenIcon />
          {lockedCost}
        </span>
      )}
    </Link>
  );
}
