'use client';

// The recipe book: what the collected items are for, and the oven they go in.
//
// One card per recipe. A card shows the treat, its ingredients as chips (the
// ones the kid holds in colour, the rest as silhouettes, same language as the
// collection grid above it), and one of three states: still collecting, ready
// to bake, or baked. Baking posts to /api/bakery/bake, which does the checking
// and the granting; this only draws what it is told.
//
// When the oven opens, Cakey appears and says the recipe's line, reusing the
// same cheer the hidden land chests use so the two moments feel like one
// voice. Then the card turns over to show what the kid got and where to wear
// it. The reward is NOT printed before the bake: the treat's name and picture
// are the promise, and what it hands over is the surprise.

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { CandyButton } from '@/components/ui/CandyButton';
import CakeyChestCheer from '@/components/town/CakeyChestCheer';
import { findItem } from '@/lib/items/catalog';
import type { BakeRewardResult, RecipeEntry } from '@/lib/items/recipes';

interface BakeResponse {
  baked?: boolean;
  alreadyBaked?: boolean;
  rewards?: BakeRewardResult[];
  error?: string;
}

type CardState =
  | { kind: 'idle' }
  | { kind: 'baking' }
  | { kind: 'stuck' }
  | { kind: 'baked'; rewards: BakeRewardResult[] };

export default function RecipeBook({
  entries,
  isGuest,
}: {
  entries: RecipeEntry[];
  isGuest: boolean;
}): React.ReactElement {
  const [cheer, setCheer] = useState<string | null>(null);
  const clearCheer = useCallback(() => setCheer(null), []);

  return (
    <>
      <ul className="mx-auto grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <RecipeCard
            key={entry.recipe.slug}
            entry={entry}
            isGuest={isGuest}
            onBaked={(line) => setCheer(line)}
          />
        ))}
      </ul>
      {cheer ? <CakeyChestCheer line={cheer} onDone={clearCheer} /> : null}
    </>
  );
}

function RecipeCard({
  entry,
  isGuest,
  onBaked,
}: {
  entry: RecipeEntry;
  isGuest: boolean;
  onBaked: (line: string) => void;
}): React.ReactElement {
  const { recipe, have, missing, ready, bakedAt } = entry;
  const [state, setState] = useState<CardState>({ kind: 'idle' });

  // A bake the server already knows about renders the rewards from the
  // recipe itself; there is no result to show, only what is now owned.
  const baked =
    state.kind === 'baked'
      ? state.rewards
      : bakedAt
        ? recipe.rewards.map((r): BakeRewardResult => ({ ...r, outcome: 'owned', tokens: 0 }))
        : null;

  const bake = async (): Promise<void> => {
    setState({ kind: 'baking' });
    try {
      const res = await fetch('/api/bakery/bake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_slug: recipe.slug }),
      });
      const data = (await res.json()) as BakeResponse;
      if (!res.ok || !data.baked) {
        setState({ kind: 'stuck' });
        return;
      }
      setState({ kind: 'baked', rewards: data.rewards ?? [] });
      if (!data.alreadyBaked) onBaked(recipe.line);
    } catch {
      setState({ kind: 'stuck' });
    }
  };

  const heldCount = have.length;
  const total = recipe.ingredients.length;

  return (
    <li
      className={
        'flex flex-col gap-2 rounded-2xl border px-3 py-3 ' +
        (baked
          ? 'border-amber-300 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/30'
          : ready
            ? 'border-emerald-300 bg-white shadow-sm dark:border-emerald-800/60 dark:bg-zinc-900'
            : 'border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/40')
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={'text-4xl leading-none ' + (baked || ready ? '' : 'opacity-40 grayscale')}
          aria-hidden
        >
          {recipe.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-tight text-zinc-900 dark:text-zinc-100">
            {recipe.name}
          </h3>
          <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">{recipe.blurb}</p>
        </div>
      </div>

      {/* Ingredient chips in recipe order. Silhouettes for the missing ones,
          so the card reads the same way the grid above it does. */}
      <ul className="flex flex-wrap gap-1" aria-label={`${heldCount} of ${total} ingredients`}>
        {recipe.ingredients.map((slug) => {
          const item = findItem(slug);
          const held = !missing.includes(slug);
          return (
            <li
              key={slug}
              title={item?.name ?? slug}
              className={
                'flex h-8 w-8 items-center justify-center rounded-lg text-lg ' +
                (held
                  ? 'bg-white shadow-sm dark:bg-zinc-800'
                  : 'border border-dashed border-zinc-300 opacity-30 grayscale dark:border-zinc-600')
              }
            >
              <span aria-hidden>{item?.emoji ?? '❔'}</span>
              <span className="sr-only">
                {item?.name ?? slug}
                {held ? '' : ' (not found yet)'}
              </span>
            </li>
          );
        })}
      </ul>

      {baked ? (
        <div className="rounded-xl bg-white/80 px-3 py-2 text-xs dark:bg-zinc-900/60">
          <p className="font-display font-bold text-amber-700 dark:text-amber-300">Baked!</p>
          <ul className="mt-1 space-y-0.5 text-zinc-700 dark:text-zinc-200">
            {baked.map((r) => (
              <li key={`${r.kind}:${r.value}`}>
                {r.outcome === 'refunded'
                  ? `${r.label} — you had it already, so ${r.tokens} tokens came back to you.`
                  : `${r.label} — yours now, in the Store.`}
              </li>
            ))}
          </ul>
          <Link
            href="/kids/customize"
            className="mt-1.5 inline-block font-display font-bold text-sky-700 underline dark:text-sky-300"
          >
            Wear it →
          </Link>
        </div>
      ) : ready ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {state.kind === 'stuck' ? 'The oven is stuck. Try again in a moment.' : 'You have everything!'}
          </p>
          <CandyButton
            role="grow"
            size="sm"
            onClick={bake}
            disabled={isGuest || state.kind === 'baking'}
          >
            {state.kind === 'baking' ? 'Baking…' : 'Bake it!'}
          </CandyButton>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {heldCount === 0
            ? `Needs ${total} things you have not found yet.`
            : `${heldCount} of ${total} ingredients. Keep looking.`}
        </p>
      )}
    </li>
  );
}
