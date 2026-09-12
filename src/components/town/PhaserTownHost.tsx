'use client';

// PhaserTownHost — React shell for the Gamecakes City town scene.
//
// Forked from PhaserGameHost (src/components/games/phaser/PhaserGameHost.tsx)
// rather than extended because the town has none of the per-game
// shell concerns: no /api/attempts POST (the town isn't a "game"
// session), no challenge modal, no game-over overlay, no Play Again
// flow. Reusing the host with feature flags would have bloated a
// critical shared file with code paths only the town hits.
//
// What we kept from PhaserGameHost (intentionally identical so any
// future fixes there can mirror here cheaply):
//   - dynamic Phaser import + createdRef strict-mode guard + destroy
//     on unmount
//   - the iPad touch-lock effect (document-level rubber-band killer)
//   - hostBus event emitter pattern; scene reads it via registry
//   - Phaser.Scale.FIT mode + scale.refresh() on fullscreen change
//   - SoundToggle + FullscreenToggle + Back-to-Map chrome
//   - SFX dispatcher for `scene:sfx` events
//
// What we added (cumulative through PR 5):
//   - town:position-update bus event → throttled POST /api/town/position
//   - town:enter-game bus event → router.push('/games/{slug}')
//   - town:approach-fog → opens UnlockRegionModal with the target region
//   - Modal confirm → POST /api/town/discover; on success, update host
//     balance state and emit town:request-discover back to the scene
//     so it animates the fog away

import Link from 'next/link';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Types as PhaserTypes } from 'phaser';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import AnimatedCoinCount from '@/components/wallet/AnimatedCoinCount';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import GamecakesLogo from '@/components/GamecakesLogo';
import UnlockRegionModal from '@/components/town/UnlockRegionModal';
import {
  playBubble,
  playCatch,
  playCorrect,
  playEscape,
  playHop,
  playLevelUp,
  playPadPress,
  playStart,
  playSwoop,
  playTap,
  playTick,
  playTimeUp,
  playWin,
  playWrong,
} from '@/lib/games/shared/sounds';
import { hapticTap, hapticThump, hapticSuccess, hapticWrong } from '@/lib/haptics';
import type { SoundName } from '@/lib/games/phaser/session';
import { WORLD_PX, findRegion, REGIONS, type Region } from '@/lib/town/regions';
// Factory imported inside the host (a client component) so the page
// — a Server Component — never has to serialize it as a prop. Functions
// can't cross the Server→Client boundary in App Router; trying to pass
// the factory from /town/page.tsx blew up at runtime with a "page
// couldn't load" error even though next build was clean.
import { TownSceneFactory } from '@/lib/town/phaser/TownScene.factory';

// Sound dispatcher — same shape as PhaserGameHost so scenes can use
// any sound from the catalog (footsteps will likely be `tap`, unlock
// fanfares `levelUp`, etc.).
const SFX: Record<SoundName, () => void> = {
  tap: playTap,
  catch: playCatch,
  escape: playEscape,
  hop: playHop,
  tick: playTick,
  padPress: playPadPress,
  timeUp: playTimeUp,
  win: playWin,
  correct: playCorrect,
  wrong: playWrong,
  bubble: playBubble,
  swoop: playSwoop,
  levelUp: playLevelUp,
  start: playStart,
};

const HAPTICS: Partial<Record<SoundName, () => void>> = {
  catch: hapticThump,
  win: hapticSuccess,
  correct: hapticThump,
  wrong: hapticWrong,
  levelUp: hapticSuccess,
  padPress: hapticTap,
};

export interface PhaserTownHostProps {
  /** Title shown in the page header (non-fullscreen mode). */
  title: string;
  /** Kid's display name — passed through to the scene for the welcome
   *  bubble and to the position POST for logging. */
  kidName?: string;
  /** Props passed into the scene via game.registry.set('sceneProps').
   *  Must be JSON-serializable since this object is passed across the
   *  Server→Client boundary from /town/page.tsx. */
  sceneProps: Record<string, unknown>;
  /** Initial token balance — used by the unlock modal so it can show
   *  the kid what they can afford. Updated locally on a successful
   *  discover so the modal stays in sync without a re-fetch. */
  initialBalance: number;
}

interface PositionPayload {
  region_slug: string;
  x: number;
  y: number;
}

interface EnterGamePayload {
  gameSlug: string;
}

interface ApproachFogPayload {
  regionSlug: string;
  cost: number;
}

interface DiscoverResponse {
  balance: number;
  status: 'discovered' | 'already_discovered' | 'insufficient_balance';
  region_slug: string;
}

export default function PhaserTownHost(props: PhaserTownHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const busRef = useRef<Phaser.Events.EventEmitter | null>(null);
  const createdRef = useRef(false);
  const router = useRouter();

  // Wallet — host owns this so the modal can render "you have X"
  // synchronously and update on a successful discover without a
  // round-trip to /api/tokens.
  const [balance, setBalance] = useState<number>(props.initialBalance);

  // Local discovered set — initialized from the page-rendered
  // sceneProps and grown as the kid unlocks regions. Used to
  // compute isStuck for the Cakey hint bubble.
  const initialDiscovered = useMemo(() => {
    const slugs = (props.sceneProps.discovered as unknown) as string[] | undefined;
    return new Set(slugs ?? []);
  }, [props.sceneProps.discovered]);
  const [discoveredSlugs, setDiscoveredSlugs] = useState<Set<string>>(initialDiscovered);

  // Hint dismissal — kid can close the bubble for the session.
  // We don't auto-resurrect because once dismissed the kid is
  // either grinding games (which will close it via balance growth)
  // or wants visual quiet.
  const [hintDismissed, setHintDismissed] = useState(false);

  // Modal state. region != null means the modal is open. pending is
  // true while the POST /api/town/discover is in flight; errorMessage
  // is set when the route returned an error response we can show
  // (insufficient_balance is treated as a server-side affirmation
  // of what the modal already said, so it surfaces as a generic
  // "try again" hint rather than a panicky red banner).
  const [modalRegion, setModalRegion] = useState<Region | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | undefined>(undefined);

  // "Stuck" = there's at least one fogged adjacent region the kid
  // could spatially reach, AND none of them are affordable. The
  // hint bubble points the kid back to playing games. If there are
  // no adjacent fogs at all (everything reachable already
  // discovered), the kid isn't stuck — they're caught up.
  const isStuck = useMemo(() => {
    const adjacentFogs = REGIONS.filter(
      (r) =>
        !r.starter &&
        !discoveredSlugs.has(r.slug) &&
        r.neighbors.some((n) => discoveredSlugs.has(n)),
    );
    if (adjacentFogs.length === 0) return false;
    return adjacentFogs.every((r) => r.unlock_cost > balance);
  }, [balance, discoveredSlugs]);

  const closeModal = useCallback(() => {
    setModalRegion(null);
    setModalPending(false);
    setModalError(undefined);
  }, []);

  const onConfirmUnlock = useCallback(async () => {
    if (!modalRegion || modalPending) return;
    setModalPending(true);
    setModalError(undefined);
    try {
      const res = await fetch('/api/town/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_slug: modalRegion.slug }),
      });
      if (!res.ok) {
        setModalError('Could not reveal — try again in a moment.');
        setModalPending(false);
        return;
      }
      const data = (await res.json()) as DiscoverResponse;
      // Sync wallet to the server-authoritative balance — this also
      // covers the already_discovered case where the server returned
      // current balance unchanged.
      setBalance(data.balance);
      // Mirror the discovery into host state so isStuck
      // re-computes correctly for the next-tier neighbors.
      setDiscoveredSlugs((prev) => {
        const next = new Set(prev);
        next.add(modalRegion.slug);
        return next;
      });
      // Tell the scene to animate the fog away. Even on
      // already_discovered we emit so the scene reconciles its local
      // discoveredSlugs set if the host had stale state.
      busRef.current?.emit('town:request-discover', {
        regionSlug: modalRegion.slug,
      });
      closeModal();
    } catch {
      setModalError('Network blip — try again.');
      setModalPending(false);
    }
  }, [modalRegion, modalPending, closeModal]);

  const isFullscreen = useIsFullscreen();
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    const t = window.setTimeout(() => g.scale.refresh(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // ---- iPad touch-lock (identical to PhaserGameHost) ----
  // Locks the page chrome so a finger drag on the canvas can't
  // rubber-band the page. Restored on unmount via the cleanup return.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlTouchAction: html.style.touchAction,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
    };
    html.style.overflow = 'hidden';
    html.style.touchAction = 'none';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';

    const blockTouchMove = (e: TouchEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, input, [role="dialog"]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', blockTouchMove);
      html.style.overflow = prev.htmlOverflow;
      html.style.touchAction = prev.htmlTouchAction;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  // ---- Position POST (fire-and-forget, keepalive so a tab close
  // ----  doesn't drop the last save). Throttling lives in the scene
  // ----  via a 3s timer event, so the host just forwards every emit.
  const postPosition = useCallback((payload: PositionPayload) => {
    fetch('/api/town/position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Best-effort. If the network is dead the next emit will retry.
    });
  }, []);

  // ---- Mount Phaser game ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    let destroyed = false;

    (async () => {
      const Phaser = await import('phaser');

      if (destroyed || !containerRef.current) return;

      const bus = new Phaser.Events.EventEmitter();
      busRef.current = bus;

      // Scene → host vocabulary
      bus.on('scene:sfx', (payload: { name: SoundName }) => {
        SFX[payload.name]?.();
        HAPTICS[payload.name]?.();
      });
      bus.on('town:position-update', (payload: PositionPayload) => {
        postPosition(payload);
      });
      bus.on('town:enter-game', (payload: EnterGamePayload) => {
        // Navigate via the router so the existing per-game shells work
        // unchanged (each game has its own /games/{slug}/page.tsx that
        // mounts GameLauncher → its own PhaserGameHost). The town
        // scene saves position before emitting, so when the kid
        // returns the avatar respawns where they left.
        router.push(`/games/${payload.gameSlug}`);
      });
      bus.on('town:approach-fog', (payload: ApproachFogPayload) => {
        // Look up the region from the catalog so the modal has theme
        // copy + name without the scene having to ship them through
        // the bus payload. findRegion is a constant-time array find
        // over 8 entries — cheap.
        const region = findRegion(payload.regionSlug);
        if (!region) return;
        setModalRegion(region);
        setModalError(undefined);
        setModalPending(false);
      });

      const SceneClass = await TownSceneFactory.create();
      if (destroyed) return;

      const config: PhaserTypes.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: WORLD_PX.w,
        height: WORLD_PX.h,
        backgroundColor: '#bfdbfe', // sky-200, sits behind region rects
        physics: {
          default: 'arcade',
          arcade: {
            // Town is top-down — no gravity. Avatar walks via velocity.
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: SceneClass,
        audio: { disableWebAudio: true },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      game.registry.set('sceneProps', props.sceneProps);
      game.registry.set('hostBus', bus);
    })();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      if (busRef.current) {
        busRef.current.removeAllListeners();
        busRef.current = null;
      }
      createdRef.current = false;
    };
    // Mount once — props are captured at boot. To swap scenes the
    // parent must remount (same contract as PhaserGameHost).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-sky-100 select-none dark:bg-zinc-950'
          : 'flex flex-1 flex-col items-center overscroll-none p-4 select-none sm:p-6'
      }
    >
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <BalancePill balance={balance} />
          <ChromeNavLink href="/town" ariaLabel="Back to map" variant="dark" size="sm">
            ← Map
          </ChromeNavLink>
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-4xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Gamecakes City
              </div>
              <h1 className="text-2xl font-bold">{props.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BalancePill balance={balance} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      <div
        ref={containerRef}
        className={
          isFullscreen
            ? 'w-full flex-1 overflow-hidden bg-sky-100'
            : 'mt-3 w-full max-w-4xl overflow-hidden rounded-3xl bg-sky-100 shadow-xl'
        }
        style={{
          ...(isFullscreen ? {} : { aspectRatio: `${WORLD_PX.w} / ${WORLD_PX.h}` }),
          touchAction: 'none',
        }}
        aria-label="Gamecakes City map"
      />

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href="/town" variant="dark">
            ← Back to Map
          </ChromeNavLink>
        </div>
      )}

      {modalRegion ? (
        <UnlockRegionModal
          region={modalRegion}
          balance={balance}
          pending={modalPending}
          errorMessage={modalError}
          onCancel={closeModal}
          onConfirm={onConfirmUnlock}
        />
      ) : null}

      {isStuck && !hintDismissed && !modalRegion ? (
        <CakeyHint onDismiss={() => setHintDismissed(true)} />
      ) : null}
    </main>
  );
}

/** Floating hint shown when the kid has fogged adjacent regions but
 *  can't afford any of them. Suppressed when the unlock modal is
 *  open (the modal is the more direct UI for that state). */
function CakeyHint({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/40 bg-white/95 px-5 py-3 text-sm font-semibold text-zinc-800 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100">
        <span className="text-2xl" aria-hidden>
          🎂
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500">
            Cakey says
          </span>
          <span>Play games to earn more 🪙!</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss hint"
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-base text-zinc-700 hover:bg-zinc-200 active:scale-95 dark:bg-zinc-800 dark:text-zinc-300"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Small balance display pinned in the town chrome — kept inline rather
 *  than reusing the /map CoinBadge because that one fetches /api/tokens
 *  on its own, and we already have the authoritative balance in host
 *  state. Keeping them separate avoids the two-source-of-truth problem
 *  where the badge and the modal could disagree by one round-trip. */
function BalancePill({ balance }: { balance: number }): React.ReactElement {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-100/85 px-3 py-2 text-sm font-bold text-amber-900 backdrop-blur-sm"
      style={{ minHeight: 'var(--min-tap-target)' }}
      aria-label={`Wallet: ${balance} Sugar Tokens`}
      aria-live="polite"
    >
      <SugarTokenIcon />
      <AnimatedCoinCount value={balance} className="font-mono tabular-nums" />
    </div>
  );
}
