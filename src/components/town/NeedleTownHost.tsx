'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ThreeTownHostProps } from '@/components/town/ThreeTownHost';
import { registerGameDome } from '@/lib/town/needle/components/GameDome';
import { loadNeedleRuntime } from '@/lib/town/needle/runtime';
import type { GameDomeActivateDetail } from '@/lib/town/needle/types';

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * The spike host only renders a title — it deliberately does NOT accept the full
 * ThreeTownHost contract, because it cannot honour it. Gameplay, saves, minimap
 * and multiplayer all still live in the legacy engine. Narrowing the prop type
 * keeps `TownHost` in town/page.tsx from reading as a drop-in renderer swap.
 */
export type NeedleTownHostProps = Pick<ThreeTownHostProps, 'title'>;

const SPIKE_SCENE_SRC = '/needle/scenes/game-dome-spike.glb';

export default function NeedleTownHost({
  title,
}: NeedleTownHostProps): React.ReactElement {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [activation, setActivation] = useState<GameDomeActivateDetail | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let element: HTMLElement | null = null;

    const onActivate = (event: Event): void => {
      const detail = (event as CustomEvent<GameDomeActivateDetail>).detail;
      if (detail) setActivation(detail);
    };

    void (async () => {
      try {
        // Register the component BEFORE the element mounts and starts loading
        // the GLB — the loader looks the type up during deserialization, and a
        // late registration would be missed. Both must share one engine module
        // instance, because Needle's TypeStore is a module-scoped singleton.
        const engine = await loadNeedleRuntime();
        if (disposed) return;
        registerGameDome(engine);

        element = document.createElement('needle-engine');
        element.setAttribute('src', SPIKE_SCENE_SRC);
        element.setAttribute('camera-controls', '');
        element.setAttribute('environment-image', 'studio');
        element.setAttribute('contactshadows', '');
        element.setAttribute('tone-mapping', 'agx');
        element.setAttribute('background-color', '#bfe8ff');
        element.style.display = 'block';
        element.style.width = '100%';
        element.style.height = '100%';
        element.style.touchAction = 'none';
        // GameDome dispatches on context.domElement, which IS this element.
        element.addEventListener('gamecakes:dome-activate', onActivate);
        mount.appendChild(element);

        setLoadState('ready');
      } catch (error) {
        console.error('[town/needle] Prototype failed to initialize.', error);
        if (!disposed) {
          setLoadState('failed');
          // The query flag is deliberately absent from the fallback URL, so a
          // broken prototype cannot loop. Keep APIs and gameplay available.
          window.setTimeout(() => window.location.replace('/town?needleFallback=1'), 800);
        }
      }
    })();

    return () => {
      disposed = true;
      element?.removeEventListener('gamecakes:dome-activate', onActivate);
      element?.remove();
    };
  }, []);

  return (
    <main className="relative h-dvh min-h-[520px] overflow-hidden bg-sky-100">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4">
        <div className="rounded-2xl border border-white/60 bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-700">
            Needle spike
          </p>
          <h1 className="text-lg font-black text-zinc-900">{title}</h1>
          <p className="text-xs text-zinc-600">
            Reusable Game Dome, Blender-ready component contract
          </p>
        </div>

        <Link
          href="/town"
          className="pointer-events-auto rounded-full border border-white/70 bg-white/95 px-4 py-2 text-sm font-bold text-zinc-800 shadow-lg active:scale-95"
        >
          Legacy town
        </Link>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-5">
        <div
          className="max-w-md rounded-2xl border border-white/60 bg-zinc-950/80 px-5 py-3 text-center text-sm font-semibold text-white shadow-xl backdrop-blur"
          role="status"
          aria-live="polite"
        >
          {loadState === 'loading'
            ? 'Loading the Needle-authored dome…'
            : loadState === 'failed'
              ? 'Needle failed to start. Return to the legacy town.'
              : activation
                ? `Activated ${activation.gameSlug} in ${activation.regionSlug}.`
                : 'Drag to orbit. Tap the glowing portal to test the shared interaction component.'}
        </div>
      </div>
    </main>
  );
}
