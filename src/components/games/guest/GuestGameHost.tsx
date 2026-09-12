'use client';

// Mounts any game in the arcade, for someone with no account.
//
// The mount table (lib/games/guest-mounts.ts) says which host to load; this
// loads it, hands it the shared gentle preset, and — the whole point —
// deliberately passes NO attemptMeta. Every host guards on that before its
// POST, so the game plays normally and writes nothing.
//
// Chrome is minimal on purpose. A visitor has never seen Gamecakes: a level
// grid, a math-kind picker and a difficulty toggle are three decisions before
// any fun happens. They get the game, and one invitation at the end.

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { GUEST_MOUNTS, GUEST_SCENE_PROPS } from '@/lib/games/guest-mounts';
import GamecakesLogo from '@/components/GamecakesLogo';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Same reason as the mount table: sixteen hosts with unrelated prop types,
 * resolved at runtime. guest-mounts.test.ts proves each one loads. */
type Loaded = { Host: ComponentType<any>; props: Record<string, unknown> } | null;

export default function GuestGameHost({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  // Looked up during render, not in the effect: it is a pure map read, and
  // setting state synchronously inside an effect triggers a cascading render.
  // (Unreachable in practice — /play/[slug] 404s an unknown slug server-side —
  // but this component should be safe mounted anywhere.)
  const mount = GUEST_MOUNTS[slug];

  const [loaded, setLoaded] = useState<Loaded>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!mount) return;

    (async () => {
      try {
        const mod = await mount.load();
        // NOTE: no attemptMeta anywhere below. That omission IS guest mode.
        // EVERY host gets these. They used to be written out twice, once per
        // branch, and the two copies drifted: the non-phaser branch omitted
        // `title`, so eleven arcade games rendered no name and labelled their
        // canvas 'undefined game area' to a screen reader. Built once here so
        // a host cannot be given a partial set again.
        //
        // backHref/backLabel are NOT the mechanism for the exit button -- only
        // PhaserGameHost reads them, which is exactly how that bug hid. The
        // real answer is useGameBackTarget(), which recognises /play/ by
        // pathname inside every host. These stay as PhaserGameHost's own
        // documented fallback.
        const common = {
          title,
          gameSlug: slug,
          sceneProps: GUEST_SCENE_PROPS,
          backHref: '/play',
          backLabel: '← All games',
        };
        const props: Record<string, unknown> =
          mount.kind === 'phaser'
            ? await (async () => {
                const f = await mount.factory();
                const [factoryKey, widthKey, heightKey] = mount.keys;
                return {
                  ...common,
                  sceneFactory: f[factoryKey],
                  width: f[widthKey],
                  height: f[heightKey],
                };
              })()
            : common;
        if (!cancelled) setLoaded({ Host: mod.default, props });
      } catch {
        // A game that cannot load should offer the rest of the arcade rather
        // than a broken frame — this is a stranger's first impression.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mount, slug, title]);

  if (!mount || failed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <GamecakesLogo size={48} />
        <p className="text-lg font-semibold">That one is not loading right now.</p>
        <Link href="/play" className="text-sm font-medium text-rose-600 underline">
          ← Try another game
        </Link>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <GamecakesLogo size={48} />
        <p className="text-sm text-zinc-500">Loading {title}…</p>
      </main>
    );
  }

  const { Host, props } = loaded;
  return (
    <>
      <Host {...props} />
      {/* The one invitation. After a game, not before it — someone who has
          just enjoyed a round is the only person for whom "keep your progress"
          means anything. */}
      <div className="mx-auto max-w-lg px-4 pb-10 pt-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Nothing here is saved. Want the town, your own cupcake, and questions
          that follow along as you get better?
        </p>
        <Link
          href="/signup"
          className="mt-3 inline-block rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Make a free account
        </Link>
      </div>
    </>
  );
}
