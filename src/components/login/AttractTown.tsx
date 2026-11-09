'use client';

// The real Gamecakes City behind the login form, in attract mode: the same
// three.js engine /town runs, every land open, the drone camera circling wide
// while the cupcake strolls and Cakey wanders. It is the game, not a picture
// of it — the sea, the sky, the trains and ferries are the ones a kid gets.
//
// Nothing here can reach a server. The engine is built with no kid, every
// region passed as discovered (so there is no fog to buy through), callbacks
// that do nothing, and a container with pointer events off, so a tap lands on
// the form, never in the town. The engine never posts on its own; the host is
// what talks to /api, and this host doesn't.
//
// LoginShore (the CSS scene) stays underneath as the first frame and the
// fallback: it shows until the engine's first paint, and stays if WebGL is
// off, the art fails to load, or the visitor prefers reduced motion (the town
// would still orbit, and a login page is no place to insist).

import { useEffect, useRef, useState } from 'react';
import LoginShore from '@/components/login/LoginShore';
import { webglAvailable } from '@/lib/webgl';
import { REGIONS, findRegion } from '@/lib/town/regions';
import type { TownEngine } from '@/lib/town/three/engine';

/** Where the stroll begins. Town Square is the first land every kid sees. */
const START_REGION = 'town-square';

export default function AttractTown(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!webglAvailable()) return;

    let destroyed = false;
    let engine: TownEngine | null = null;
    let unownedArt: { dispose: () => void } | null = null;

    (async () => {
      const [THREE, engineMod] = await Promise.all([
        import('three'),
        import('@/lib/town/three/engine'),
      ]);
      if (destroyed) return;
      const townArt = await engineMod.preloadTownArt(THREE);
      unownedArt = townArt;
      if (destroyed) {
        unownedArt = null;
        townArt.dispose();
        return;
      }
      const start = findRegion(START_REGION) ?? REGIONS[0];
      const noop = (): void => {};
      engine = engineMod.createTownEngine(
        THREE,
        container,
        {
          spawnPx: { x: start.spawnPoint.x, y: start.spawnPoint.y },
          spawnRegionSlug: start.slug,
          // Every land open: no fog, so no approach-to-unlock can ever fire.
          discovered: REGIONS.map((r) => r.slug),
        },
        {
          onRegionChange: noop,
          onPositionUpdate: noop,
          onApproachFog: noop,
          onNearBuilding: noop,
          onEnterGame: noop,
          onNearTrain: noop,
        },
        townArt,
      );
      unownedArt = null;
      engine.startAttract();
      setLive(true);
    })().catch(() => {
      // WebGL lost, art 404, anything: the CSS shore is already showing.
      unownedArt?.dispose();
      unownedArt = null;
    });

    // Don't burn a GPU for a tab nobody is looking at.
    const onVisibility = (): void => engine?.setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    const onResize = (): void => engine?.resize();
    window.addEventListener('resize', onResize);

    return () => {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      engine?.dispose();
      engine = null;
      unownedArt?.dispose();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <LoginShore />
      {/* The engine mounts its canvas here; it fades in over the shore once
          the first frame has drawn, so there is never a blank blue box. */}
      <div
        ref={containerRef}
        className={
          'absolute inset-0 transition-opacity duration-700 ease-out ' + (live ? 'opacity-100' : 'opacity-0')
        }
      />
      {/* A soft lift behind the form column so the headline stays legible over
          whatever the orbit is showing — sky, sea, or a cake castle. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 42% 60% at 50% 55%, rgba(255,251,235,0.55) 0%, rgba(255,251,235,0.25) 50%, transparent 75%)',
        }}
      />
    </div>
  );
}
