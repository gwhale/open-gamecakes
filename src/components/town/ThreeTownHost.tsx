'use client';

// ThreeTownHost — React shell for the 3D free-roam Gamecakes City.
//
// Forked from ParkMapHost: it owns the SAME renderer-agnostic economy shell
// (balance state, UnlockRegionModal → POST /api/town/discover, isStuck hint,
// iPad touch-lock, chrome) but swaps the Canvas2D renderer for the three.js
// town engine. The engine is dynamic-imported with `three` inside a useEffect
// so the WebGL/3D code never enters the server bundle — the same bundle-
// hygiene pattern Sandcastle Siege uses.
//
// Engine → React is direct callbacks (the host owns the engine instance, so no
// event bus); React → engine is direct method calls (revealRegion, getState).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import GamecakesLogo from '@/components/GamecakesLogo';
import UnlockRegionModal from '@/components/town/UnlockRegionModal';
import MapMenu from '@/components/map/MapMenu';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import AnimatedCoinCount from '@/components/wallet/AnimatedCoinCount';
import { playTap, playLevelUp, playStart, playBounce, playBubble, playTrainWhistle } from '@/lib/games/shared/sounds';
import { getGuestCoins } from '@/lib/tokens/guest-wallet';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { REGIONS, findRegion, getRegionForGame, type Region } from '@/lib/town/regions';
import { findGame } from '@/lib/games/registry';
import type { TownEngine, TownPositionPayload, TownMinimap, CakeyMoveInfo } from '@/lib/town/three/engine';
import { PLAIN_CUPCAKE, type CupcakeConfig } from '@/lib/cupcake/config';
import { joinTownChannel, type TownChannelHandle } from '@/lib/realtime/town-channel';
import CakeyOverlay from '@/components/town/CakeyOverlay';
import ThumbPad from '@/components/town/ThumbPad';
import StormModal from '@/components/town/StormModal';
import RentalModal from '@/components/town/RentalModal';
import LandEvolutionPanel from '@/components/town/LandEvolutionPanel';
import StoryAlert from '@/components/town/StoryAlert';
import StoryCard from '@/components/town/StoryCard';
import StoryCutscene from '@/components/town/StoryCutscene';
import TokenNoticeCard, { type TokenNotice } from '@/components/town/TokenNoticeCard';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';
import type { WeatherKind } from '@/lib/town/weather-config';
import { findVehicle, type VehicleKind } from '@/lib/town/vehicles';
import {
  getTownSessionPos,
  setTownSessionPos,
  getTownSessionRide,
  setTownSessionRide,
  getTownSessionRentals,
  setTownSessionRentals,
  getTownSessionDiscovered,
  setTownSessionDiscovered,
} from '@/lib/town/town-session';
import { STORY_EVENTS, findStory, type StoryEvent } from '@/lib/town/story-events';
import { arrivalPrice } from '@/lib/tokens/economy';
import { islandOf } from '@/lib/town/islands';

export interface ThreeTownHostProps {
  /** Title shown in the page header (non-fullscreen mode). */
  title: string;
  /** Kid's display name — header + Cakey's greeting. */
  kidName?: string;
  /** Kid's grade for Cakey's trivia calibration (0=K…6), or null for default. */
  kidGrade?: number | null;
  /** Kid's avatar emoji — reserved for a future name-tag; unused for now. */
  avatar?: string;
  /** Slug of the region the kid was last in (spawn region). */
  spawnRegionSlug: string;
  /** Exact last position in world px, if known. Falls back to region center. */
  spawnX?: number;
  spawnY?: number;
  /** Slugs the kid has discovered so far. */
  initialDiscovered: string[];
  /** Starting wallet balance. */
  initialBalance: number;
  /** Vehicle kinds the kid currently holds a valid rental for (rides they can
   *  hop on free today). Resolved server-side; omitted (→ none) for guests. */
  initialRentals?: VehicleKind[];
  /** Story-alert slugs this kid has already seen (from kid_story_seen). The host
   *  auto-toasts the first eligible UNSEEN story; stories stay replayable from
   *  Cakey's panel regardless. Omitted (→ none seen) for guests. */
  seenStorySlugs?: string[];
  /** Recent parent token grants/removals this kid hasn't been shown yet — each
   *  becomes a one-time "a grown-up added/removed coins" card. Omitted for guests. */
  tokenNotices?: TokenNotice[];
  /** Guest sandbox — the wallet is ephemeral (client sessionStorage), so the
   *  pill reads/refreshes from the local guest wallet instead of the server. */
  isGuest?: boolean;
  /** The kid's cupcake_config — drives the walking avatar's look (base +
   *  frosting/wrapper colors). Falls back to a plain cupcake if absent. */
  cupcakeConfig?: CupcakeConfig;
  /** Per-kid land icons: region slug → owning kid's cupcake_config. Renders
   *  each per-kid land's center landmark as that kid's cupcake. Resolved
   *  server-side; omitted for guests. */
  landCupcakes?: Record<string, CupcakeConfig>;
  /** Per-kid land evolution levels: region slug → owner's stage (0..N). Scales
   *  the land's pad + hero and swaps in its evolved structure (Plot → Castle).
   *  Family-wide, resolved server-side; missing slug = level 0. */
  landLevels?: Record<string, number>;
  /** Slug of the per-kid land THIS viewer owns (kids.land_slug), if any. */
  ownedLandSlug?: string;
  /** The active kid's id — used as the presence key + self-echo filter on the
   *  town multiplayer channel. Present for real kids, omitted for guests. */
  kidId?: string;
  /** Hashed town-channel token (see src/lib/realtime/topic.ts). Non-null only
   *  when `?mp=1` is set AND the server secret is configured; null/undefined
   *  means run single-player (no presence layer). */
  topicToken?: string | null;
}

interface DiscoverResponse {
  balance: number;
  status: 'discovered' | 'already_discovered' | 'insufficient_balance';
  region_slug: string;
}

/** Ride camera modes (mirrors the engine's cycle) + their button faces. */
type RideCamMode = 'chase' | 'action' | 'drone' | 'sky';
const CAM_MODE_META: Record<RideCamMode, { glyph: string; label: string }> = {
  chase: { glyph: '🎥', label: 'Chase camera' },
  action: { glyph: '🏁', label: 'Action camera — low and fast' },
  drone: { glyph: '🚁', label: 'Drone camera — circles your ride' },
  sky: { glyph: '🪁', label: 'Sky camera — way up high' },
};

// Story-alert "seen" cache in sessionStorage. Guests have no DB, so without this
// the story re-toasts every time the kid comes back from a game (kid feedback,
// 2026-07-17). Also hardens real kids against same-session re-nagging if the
// server write is unavailable (e.g. the 0030 migration isn't applied yet) — the
// DB stays the cross-session source of truth. Best-effort + fail-open, mirroring
// IpadInstallPrompt's localStorage pattern.
const SEEN_STORIES_KEY = 'gamecakes:seen-stories-v1';
function readSeenStoriesSession(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.sessionStorage.getItem(SEEN_STORIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
function writeSeenStorySession(slug: string): void {
  try {
    if (typeof window === 'undefined') return;
    const next = new Set(readSeenStoriesSession());
    next.add(slug);
    window.sessionStorage.setItem(SEEN_STORIES_KEY, JSON.stringify([...next]));
  } catch {
    // fail-open; the in-memory set + (for real kids) the DB still cover it
  }
}

export default function ThreeTownHost(props: ThreeTownHostProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TownEngine | null>(null);
  const createdRef = useRef(false);
  const router = useRouter();
  const isFullscreen = useIsFullscreen();

  // For guests the wallet lives in sessionStorage (ephemeral), so seed the pill
  // from there and refresh on mount — picks up coins earned in a game the kid
  // just came back from.
  const [balance, setBalance] = useState<number>(() =>
    props.isGuest ? getGuestCoins() : props.initialBalance,
  );
  useEffect(() => {
    if (props.isGuest) setBalance(getGuestCoins());
  }, [props.isGuest]);
  const [discoveredSlugs, setDiscoveredSlugs] = useState<Set<string>>(
    () => new Set(props.initialDiscovered),
  );
  // Guests' reveals never reach the DB (the discover/ferry routes short-circuit
  // them), so mirror the set into the tab session and merge it back on mount —
  // otherwise a restored spot on Chess Isle lands inside a still-fogged land.
  // Merged in an effect, not the initializer, to keep SSR and hydration equal.
  useEffect(() => {
    if (!props.isGuest) return;
    const saved = getTownSessionDiscovered();
    if (saved.length) setDiscoveredSlugs((prev) => new Set([...prev, ...saved]));
  }, [props.isGuest]);
  useEffect(() => {
    if (!props.isGuest) return;
    setTownSessionDiscovered([...discoveredSlugs]);
  }, [props.isGuest, discoveredSlugs]);
  const [hintDismissed, setHintDismissed] = useState(false);

  // ---- Story Alerts (world-event announcements) ----
  // Which stories this kid has already seen (auto-toast is suppressed for these;
  // replay stays available). Grown optimistically as they watch/dismiss.
  const [seenStories, setSeenStories] = useState<Set<string>>(
    () => new Set(props.seenStorySlugs),
  );
  // Gate the auto-toast until the sessionStorage "seen" cache has been merged on
  // mount — otherwise a guest (whose seen-set starts empty) briefly flashes the
  // toast before the merge runs. Set true in the same mount effect.
  const [storySeenReady, setStorySeenReady] = useState(false);
  useEffect(() => {
    const cached = readSeenStoriesSession();
    if (cached.length) setSeenStories((prev) => new Set([...prev, ...cached]));
    setStorySeenReady(true);
  }, []);
  // ---- Token-change cards (a grown-up added/removed coins) ----
  // A queue of unseen parent grants/removals; shown one card at a time on mount.
  const [noticeQueue] = useState<TokenNotice[]>(() => props.tokenNotices ?? []);
  const [noticeIdx, setNoticeIdx] = useState(0);
  const currentNotice = noticeIdx < noticeQueue.length ? noticeQueue[noticeIdx] : null;
  // Dismiss the current card: mark it seen (best-effort POST) + advance the queue.
  const dismissNotice = useCallback(
    (id: string): void => {
      setNoticeIdx((i) => i + 1);
      if (props.isGuest) return;
      fetch('/api/town/token-notice-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: [id] }),
        keepalive: true,
      }).catch(() => {
        // best-effort; a dropped ack just re-shows within the recency window
      });
    },
    [props.isGuest],
  );

  // The story whose narrated card is open right now (the reduced-motion / no-
  // camera path), or null. Distinct from the toast, which is derived below.
  const [storyCardStory, setStoryCardStory] = useState<StoryEvent | null>(null);
  // The story whose CAMERA cutscene is playing, or null, plus the active beat
  // index the engine is reporting. Mutually exclusive with storyCardStory.
  const [cutsceneStory, setCutsceneStory] = useState<StoryEvent | null>(null);
  const [cutsceneBeat, setCutsceneBeat] = useState(0);

  // The one story to auto-toast: the first entry not yet seen whose trigger is
  // satisfied. Single-story-at-a-time — a second story waits until this is seen.
  const pendingStory = useMemo(() => {
    return STORY_EVENTS.find((s) => {
      if (seenStories.has(s.slug)) return false;
      if (s.trigger.kind === 'global') return true;
      return discoveredSlugs.has(s.trigger.regionSlug);
    });
  }, [seenStories, discoveredSlugs]);

  // Mark a story seen: optimistic local add (retracts the toast immediately,
  // since pendingStory derives from seenStories) + a best-effort POST. Guests
  // skip the write (no wallet/persistence); the catalog is the source of truth.
  const markStorySeen = useCallback(
    (slug: string): void => {
      setSeenStories((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
      // Session cache for everyone (the only persistence guests have; also stops
      // real kids re-nagging within a session if the server write is down).
      writeSeenStorySession(slug);
      if (props.isGuest) return;
      fetch('/api/town/story-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_slug: slug }),
        keepalive: true,
      }).catch(() => {
        // best-effort; the story just re-toasts next visit if this drops
      });
    },
    [props.isGuest],
  );

  // Start a story's mini narrative. Full-motion → the engine's camera cutscene
  // (a bottom caption band carries the beats). Reduced-motion → the narrated
  // storybook card instead (no camera takeover). This is the one entry point for
  // both the toast's "See what happened" and Cakey's replay list.
  const startCutscene = useCallback((story: StoryEvent): void => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setStoryCardStory(story);
      return;
    }
    setCutsceneBeat(0);
    setCutsceneStory(story);
    engineRef.current?.playStoryCutscene({
      regionSlug: story.regionSlug,
      style: story.style,
      beatCount: story.beats.length,
    });
  }, []);

  // ---- The viewing kid's OWN land (kids.land_slug, passed by the server) ----
  // Drives the owner-only welcome-home beat + the in-world "Grow my land"
  // upgrade kiosk. Undefined for guests and kids who own no land. Ownership is
  // DB data resolved server-side — this component never matches names.
  const ownedLandSlug = props.ownedLandSlug;
  const ownedRegion = useMemo(
    () => (ownedLandSlug ? REGIONS.find((r) => r.slug === ownedLandSlug) : undefined),
    [ownedLandSlug],
  );

  // The region the cupcake is currently standing in (seeded to the spawn land,
  // updated by the engine's onRegionChange). Drives the welcome-home beat.
  const [currentRegionSlug, setCurrentRegionSlug] = useState(props.spawnRegionSlug);

  // Owner's land stage (Plot→Castle), seeded from the server snapshot and bumped
  // locally on each in-town upgrade so the panel/ladder stay in sync without a
  // remount. The 3D structure itself refreshes on the next town load.
  const [ownedLandLevel, setOwnedLandLevel] = useState(() =>
    ownedLandSlug ? props.landLevels?.[ownedLandSlug] ?? 0 : 0,
  );

  // The in-world land-upgrade panel (opened by the "Grow my land" kiosk).
  const [landPanelOpen, setLandPanelOpen] = useState(false);
  // Keyboard dismiss for the host-owned dialog (the modal components own theirs).
  useEscapeKey(
    useCallback(() => setLandPanelOpen(false), []),
    landPanelOpen,
  );

  // A transient "Welcome home, {name}!" beat when the owner arrives on their own
  // land (on spawn + each time they walk back onto it).
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  useEffect(() => {
    if (!ownedLandSlug || currentRegionSlug !== ownedLandSlug) {
      setWelcomeVisible(false);
      return;
    }
    setWelcomeVisible(true);
    const t = window.setTimeout(() => setWelcomeVisible(false), 5200);
    return () => window.clearTimeout(t);
  }, [currentRegionSlug, ownedLandSlug]);

  const [modalRegion, setModalRegion] = useState<Region | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | undefined>(undefined);

  // Nearest enterable game booth — drives the floating Play prompt.
  const [nearGame, setNearGame] = useState<string | null>(null);
  // Whether the cupcake is currently riding the train.
  const [riding, setRiding] = useState(false);
  // Standing near a docked Cakey Ferry → show the "Take the ferry" prompt.
  const [nearFerry, setNearFerry] = useState(false);
  // Aboard the ferry mid-crossing → hide the other transport buttons.
  const [ferrying, setFerrying] = useState(false);
  // Standing at a Sugar Mile bus stop → show the "Ride the bus" prompt.
  const [nearBus, setNearBus] = useState(false);
  // Aboard the bus mid-run → hide the other transport buttons (same as ferrying).
  const [busing, setBusing] = useState(false);

  // ---- Rideable vehicles (Cakey Garage) ----
  // Which rides the kid holds a valid rental for today (drives the "Ride"/"Rent"
  // split in the garage menu). Seeded from the server, grown when they rent.
  const [rentals, setRentals] = useState<Set<VehicleKind>>(
    () => new Set(props.initialRentals ?? []),
  );
  // Guests' rentals live in the tab session, not the DB. Merged in an effect
  // rather than the initializer above so the server and first client render
  // agree (sessionStorage is empty during SSR — seeding it inline would
  // hydration-mismatch the quick-ride buttons).
  const isGuest = props.isGuest;
  useEffect(() => {
    if (!isGuest) return;
    const saved = getTownSessionRentals();
    if (saved.length === 0) return;
    setRentals((prev) => new Set([...prev, ...saved]));
  }, [isGuest]);
  const [garageOpen, setGarageOpen] = useState(false);
  // The ride currently mounted, or null. Drives the "Hop off" button + hides the
  // train/play prompts (the engine also suppresses near-building while riding).
  const [ridingVehicle, setRidingVehicle] = useState<VehicleKind | null>(null);
  // World camera mode (display only — the engine owns the actual rig). A
  // persistent setting: applies on foot and on every ride alike.
  const [rideCam, setRideCam] = useState<RideCamMode>('chase');
  const onCycleCamera = useCallback((): void => {
    const m = engineRef.current?.cycleCameraMode();
    if (m) {
      setRideCam(m);
      playTap();
      hapticTap();
    }
  }, []);
  // Which ride's rent POST is in flight, + any error, for the modal.
  const [rentPending, setRentPending] = useState<VehicleKind | null>(null);
  const [rentError, setRentError] = useState<string | undefined>(undefined);

  // Hop onto a ride the kid already holds (free) — closes the menu, mounts it.
  // The world-camera mode deliberately persists across mount/dismount.
  const onRideVehicle = useCallback((kind: VehicleKind): void => {
    if (engineRef.current?.mountVehicle(kind)) {
      setRidingVehicle(kind);
      setGarageOpen(false);
      // Remember the ride so walking into a booth and back doesn't quietly
      // dismount the kid ("my skateboard disappeared after I played a game").
      setTownSessionRide(kind);
    }
  }, []);

  // Rent a ride for the day, then hop straight on. Guests ride free (no wallet),
  // mirroring clear-storm/discover; real kids POST to debit + persist the rental.
  const onRentVehicle = useCallback(
    async (kind: VehicleKind): Promise<void> => {
      if (rentPending) return;
      if (props.isGuest) {
        setRentals((prev) => {
          const next = new Set(prev).add(kind);
          // Guests have no kid_vehicle_rentals row, so the tab session IS the
          // rental record — without this the ride vanishes from the HUD after
          // one game, not just the mount.
          setTownSessionRentals([...next]);
          return next;
        });
        onRideVehicle(kind);
        return;
      }
      setRentPending(kind);
      setRentError(undefined);
      try {
        const res = await fetch('/api/town/rent-vehicle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicle_kind: kind }),
        });
        if (!res.ok) {
          setRentError(
            res.status === 400
              ? 'Not enough Sugar Tokens yet — play some games!'
              : 'Could not rent it — try again in a moment.',
          );
          setRentPending(null);
          return;
        }
        const data = (await res.json()) as { balance: number };
        setBalance(data.balance);
        setRentals((prev) => new Set(prev).add(kind));
        hapticSuccess();
        setRentPending(null);
        onRideVehicle(kind);
      } catch {
        setRentError('Network blip — try again.');
        setRentPending(null);
      }
    },
    [rentPending, props.isGuest, onRideVehicle],
  );

  const onDismountVehicle = useCallback((): void => {
    engineRef.current?.dismountVehicle();
    setRidingVehicle(null);
    setTownSessionRide(null);
  }, []);
  // "You are here" minimap geometry (set once the engine is built).
  const [minimap, setMinimap] = useState<TownMinimap | null>(null);
  const getMinimapPos = useCallback(() => engineRef.current?.getMinimapPos() ?? null, []);

  // ---- Cakey (wandering mascot) ----
  // His screen anchor arrives ~11×/sec — kept on a ref so the follow bubble can
  // track it without re-rendering this whole tree (only the tap opens state).
  const cakeyInfoRef = useRef<CakeyMoveInfo | null>(null);
  const [cakeyPanelOpen, setCakeyPanelOpen] = useState(false);
  const setCakeyPaused = useCallback((paused: boolean) => {
    engineRef.current?.setCakeyPaused(paused);
  }, []);

  // Mirrored on a ref purely so the engine-creation effect can seed the value
  // without taking `balance` as a dependency — that would rebuild the entire
  // 3D scene every time a kid earned a token.
  const balanceRef = useRef(balance);
  // Keep the engine's copy of the wallet current. It needs this because driving
  // or flying onto an offshore island discovers it, and discovery now charges
  // for the land — so the engine must know what the kid can afford before it
  // reveals anything optimistically. Fires on mount and on every balance change.
  useEffect(() => {
    balanceRef.current = balance;
    engineRef.current?.setBalance(balance);
  }, [balance]);

  // ---- Weather + the mysterious-force storm ----
  const [weatherKind, setWeatherKind] = useState<WeatherKind>('sunny');
  // The land a storm has re-locked + its clear cost, or null when none is near.
  const [stormPrompt, setStormPrompt] = useState<{ slug: string; name: string; cost: number } | null>(null);
  const [stormPending, setStormPending] = useState(false);
  const [stormError, setStormError] = useState<string | undefined>(undefined);

  // Pay to blow the storm away early. Guests have no wallet, so they clear free.
  const onConfirmClearStorm = useCallback(async (): Promise<void> => {
    if (!stormPrompt || stormPending) return;
    const slug = stormPrompt.slug;
    if (props.isGuest) {
      engineRef.current?.clearStorm(slug);
      setStormPrompt(null);
      return;
    }
    setStormPending(true);
    setStormError(undefined);
    try {
      const res = await fetch('/api/town/clear-storm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_slug: slug }),
      });
      if (!res.ok) {
        setStormError('Could not clear it — try again, or just wait it out.');
        setStormPending(false);
        return;
      }
      const data = (await res.json()) as { balance: number };
      setBalance(data.balance);
      engineRef.current?.clearStorm(slug);
      hapticSuccess();
      setStormPrompt(null);
      setStormPending(false);
    } catch {
      setStormError('Network blip — try again, or wait it out.');
      setStormPending(false);
    }
  }, [stormPrompt, stormPending, props.isGuest]);

  // ---- Server sync ----
  const postPosition = useCallback((payload: TownPositionPayload): void => {
    // Mirror into the tab session first — it's synchronous, and it's the ONLY
    // record for guests (the route 204s them without writing a row), so it's
    // what puts a guest back on Chess Isle instead of the mainland after a game.
    setTownSessionPos(payload);
    fetch('/api/town/position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // best-effort; the next emit retries
    });
  }, []);

  // Save the latest position, then navigate into a game's shell. Mirrors the
  // walkable town's save-then-router.push contract so per-game shells respawn
  // the kid where they left.
  const doEnter = useCallback(
    (gameSlug: string): void => {
      // The Cakey Garage kiosk opens the in-town rental menu — no navigation,
      // so bail before saving/routing.
      if (gameSlug === 'store:garage') {
        setGarageOpen(true);
        return;
      }
      // The owner-only "Grow my land" kiosk opens the in-world land-upgrade
      // panel — no navigation either (sentinel slug, not a real game).
      if (gameSlug === 'land:upgrade') {
        setLandPanelOpen(true);
        return;
      }
      const state = engineRef.current?.getState();
      if (state) postPosition(state);
      // The Cakey Store booth carries a sentinel slug (not a real game) —
      // route it to the customization store instead of a game shell.
      if (gameSlug === 'store:customize') {
        router.push('/kids/customize');
        return;
      }
      router.push(`/games/${gameSlug}`);
    },
    [postPosition, router],
  );
  // Ref so the engine's onEnterGame callback (bound once at mount) always calls
  // the latest doEnter without re-creating the engine.
  const doEnterRef = useRef(doEnter);
  doEnterRef.current = doEnter;

  const onConfirmUnlock = useCallback(async (): Promise<void> => {
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
      setBalance(data.balance);
      setDiscoveredSlugs((prev) => {
        const next = new Set(prev);
        next.add(modalRegion.slug);
        return next;
      });
      engineRef.current?.revealRegion(modalRegion.slug);
      playLevelUp();
      hapticSuccess();
      setModalRegion(null);
      setModalPending(false);
    } catch {
      setModalError('Network blip — try again.');
      setModalPending(false);
    }
  }, [modalRegion, modalPending]);

  const closeModal = useCallback(() => {
    setModalRegion(null);
    setModalPending(false);
    setModalError(undefined);
  }, []);

  // ---- Stuck-hint (same logic as ParkMapHost) ----
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

  // ---- Keep the 3D canvas sized through fullscreen toggles ----
  useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // ---- iPad touch-lock (verbatim from ParkMapHost / PhaserTownHost) ----
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
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('button, input, [role="dialog"]')) return;
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

  // ---- Mount the three.js engine ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;

    // Resolve spawn px: exact last position if provided, else region center.
    // Guests get no server position (the route 204s them), so their last spot
    // comes from the tab session instead — otherwise every trip through a game
    // teleports them back to the starter region on the mainland. Real kids keep
    // using the server row, which stays the single source of truth for them.
    let spawnSlug = props.spawnRegionSlug;
    let spawnX = props.spawnX;
    let spawnY = props.spawnY;
    let bootDiscovered = props.initialDiscovered;
    if (props.isGuest) {
      // Reveals ride along with the spot — a restored position is only safe if
      // the land it sits in is unfogged (see the discovered-slugs effect above).
      const savedDiscovered = getTownSessionDiscovered();
      if (savedDiscovered.length) {
        bootDiscovered = [...new Set([...bootDiscovered, ...savedDiscovered])];
      }
      const saved = getTownSessionPos();
      if (saved && findRegion(saved.region_slug) && bootDiscovered.includes(saved.region_slug)) {
        spawnSlug = saved.region_slug;
        spawnX = saved.x;
        spawnY = saved.y;
      }
    }
    const spawnRegion = findRegion(spawnSlug) ?? REGIONS[0];
    const spawnPx = {
      x: spawnX ?? spawnRegion.spawnPoint.x,
      y: spawnY ?? spawnRegion.spawnPoint.y,
    };

    (async () => {
      const [THREE, engineMod] = await Promise.all([
        import('three'),
        import('@/lib/town/three/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      const engine = engineMod.createTownEngine(
        THREE,
        containerRef.current,
        {
          spawnPx,
          spawnRegionSlug: spawnSlug,
          discovered: bootDiscovered,
          cupcakeConfig: props.cupcakeConfig,
          landCupcakes: props.landCupcakes,
          landLevels: props.landLevels,
          ownedLandSlug,
        },
        {
          onRegionChange: (slug) => {
            // Track the current land so the owner's welcome-home beat can fire
            // when they walk back onto their own land.
            setCurrentRegionSlug(slug);
          },
          onPositionUpdate: (payload) => postPosition(payload),
          onApproachFog: ({ regionSlug }) => {
            const region = findRegion(regionSlug);
            if (region) {
              setModalRegion(region);
              setModalError(undefined);
              setModalPending(false);
            }
          },
          onNearBuilding: (slug) => setNearGame(slug),
          onEnterGame: (slug) => doEnterRef.current(slug),
          onNearTrain: () => {},
          onCakeyTap: () => setCakeyPanelOpen(true),
          onCakeyMove: (info) => {
            cakeyInfoRef.current = info;
          },
          onWeatherChange: (kind) => setWeatherKind(kind),
          onApproachStorm: ({ regionSlug, cost }) => {
            const region = findRegion(regionSlug);
            setStormPrompt({ slug: regionSlug, name: region?.name ?? 'this land', cost });
            setStormError(undefined);
            setStormPending(false);
          },
          onStormCleared: () => setStormPrompt(null),
          onCutsceneBeat: (index) => setCutsceneBeat(index),
          onCutsceneEnd: () => setCutsceneStory(null),
          onNearFerry: (near) => setNearFerry(near),
          onNearBus: (near) => setNearBus(near),
          // The engine reports both transports finishing through onFerryDone —
          // one "you are no longer a passenger" signal, so clear both flags.
          onFerryDone: () => {
            setFerrying(false);
            setBusing(false);
          },
          onIslandArrival: ({ regionSlug, via }) => {
            // The engine already revealed the island locally; persist it + charge
            // the fare (idempotent server-side; a fly arrival is free). Best-effort
            // — the reveal already holds for this session if the POST drops.
            setDiscoveredSlugs((prev) => {
              const next = new Set(prev);
              // The whole island came with this one payment (see the engine's
              // discoverIsland and /api/town/ferry) — mirror all of its lands
              // locally, or the map and the minimap would still show a land the
              // kid has already paid for as fogged.
              const isle = islandOf(regionSlug);
              for (const s of isle.id === 'mainland' ? [regionSlug] : isle.regions) next.add(s);
              return next;
            });
            playLevelUp();
            hapticSuccess();
            if (props.isGuest) return;
            fetch('/api/town/ferry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ region_slug: regionSlug, via }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d && typeof d.balance === 'number') setBalance(d.balance);
                // The engine gates on balance before revealing, and the transit
                // buttons disable when unaffordable — but the SERVER is the
                // authority (a stale client balance, or two tabs spending at
                // once, can still lose the race). If it refuses, take the land
                // back rather than leaving a kid a land they did not pay for
                // that disappears on their next reload.
                if (d && d.status === 'insufficient_balance') {
                  setDiscoveredSlugs((prev) => {
                    const next = new Set(prev);
                    // Take back the WHOLE island, matching what the arrival
                    // optimistically granted. Removing only the landing land
                    // would leave its siblings revealed and unpaid for.
                    const isle = islandOf(regionSlug);
                    for (const s of isle.id === 'mainland' ? [regionSlug] : isle.regions) next.delete(s);
                    return next;
                  });
                }
              })
              .catch(() => {});
          },
          onSfx: (name) => {
            if (name === 'tap') {
              playTap();
              hapticTap();
            } else if (name === 'levelUp') {
              playLevelUp();
              hapticSuccess();
            } else if (name === 'start') {
              playStart();
            } else if (name === 'step') {
              playBounce(); // rate-limited at the source (see playBounce)
            } else if (name === 'bump') {
              playBubble();
            } else if (name === 'launch') {
              playBounce();
              hapticTap();
            } else if (name === 'board') {
              playTrainWhistle();
              hapticSuccess();
            }
          },
        },
      );
      engineRef.current = engine;
      // Seed the wallet immediately. The balance-sync effect below is DEFINED
      // earlier in this component, so on mount it runs while engineRef is still
      // null — without this seeding, the engine would sit on its default 0 until
      // the next balance change and refuse to reveal an island the kid could
      // plainly afford.
      engine.setBalance(balanceRef.current);
      setMinimap(engine.minimap);

      // Re-mount the ride the kid was on before they walked into a booth. Gated
      // on a rental they actually still hold, so a skateboard rented yesterday
      // (the row expires at UTC midnight) doesn't come back for free.
      const held = new Set<VehicleKind>([
        ...(props.initialRentals ?? []),
        ...(props.isGuest ? getTownSessionRentals() : []),
      ]);
      const stored = getTownSessionRide();
      if (stored && held.has(stored) && engine.mountVehicle(stored)) {
        setRidingVehicle(stored);
      } else if (stored) {
        setTownSessionRide(null);
      }
    })();

    return () => {
      destroyed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      createdRef.current = false;
    };
    // Mount once — props are captured at boot. To re-spawn, remount the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Town multiplayer presence (Phase A / PR 1 plumbing, behind ?mp=1) ----
  //
  // PR 1 only PROVES the channel connects end-to-end: it joins the family's
  // town channel and logs peer joins/leaves + connection status to the console.
  // Rendering remote cupcakes (PR 2), emotes + tap-to-greet (PR 3), and Pair
  // Race (PR 4) all build on this exact wrapper. Skipped for guests (no kidId)
  // and single-player (no topicToken → flag off or secret unset).
  const channelRef = useRef<TownChannelHandle | null>(null);
  useEffect(() => {
    const { topicToken, kidId } = props;
    if (!topicToken || !kidId) return;

    const handle = joinTownChannel({
      topicToken,
      self: {
        kid_id: kidId,
        name: props.kidName ?? 'Cupcake',
        cupcake: props.cupcakeConfig ?? PLAIN_CUPCAKE,
        region_slug: props.spawnRegionSlug,
      },
      onPeers: (peers) => {
        // PR 2 turns this into upsert/remove of remote avatar meshes.
        console.info(
          '[town-mp] peers:',
          peers.map((p) => `${p.name}(${p.region_slug})`),
        );
      },
      onStatus: (status) => console.info('[town-mp] status:', status),
    });
    channelRef.current = handle;

    return () => {
      channelRef.current = null;
      void handle.leave();
    };
    // Join once on mount — topicToken/kidId are stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Floating Play prompt content for the nearest booth.
  const nearGameMeta = nearGame ? findGame(nearGame) : undefined;
  const nearRegionName = nearGame
    ? getRegionForGame(nearGame)?.name ?? undefined
    : undefined;
  // The Cakey Store booth uses a sentinel slug, so findGame() misses it —
  // detect it separately to show a "Visit" prompt instead of "Play".
  const nearStore = nearGame === 'store:customize';
  // The Cakey Garage kiosk likewise — show a "Rent a ride" prompt.
  const nearGarage = nearGame === 'store:garage';
  // The owner-only "Grow my land" kiosk — show a "Grow my land" prompt.
  const nearLandUpgrade = nearGame === 'land:upgrade';

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
          {/* Fullscreen keeps the full menu too — the old "← Map" link
              here just redirected back to /town (see header comment). */}
          <BalancePill balance={balance} />
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
          <MapMenu showWallet={false} />
        </div>
      ) : (
        <header className="flex w-full max-w-6xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-rose-600">
                Gamecakes City
              </div>
              <h1 className="text-2xl font-bold">{props.title}</h1>
            </div>
          </div>
          {/* /town is the post-login landing hub (root `/` redirects here
              whenever an active-kid cookie exists) AND /map is retired
              (permanent redirect back here) — so this header is the app's
              primary navigation. It previously had only a "← Back to Map"
              pill: below the canvas (off-screen / buried under the fixed
              CakeyHint toast) and pointing at /map, i.e. a loop back to
              this very page. Kids had literally no way to reach the kid
              picker, tickets, or parent portal ("the login screen is gone
              and I can't get to menu", 2026-06-10 ticket). Now: the same
              MapMenu hamburger the old /map had (Tickets · Parent ·
              Switch kid · Fullscreen). */}
          <div className="flex items-center gap-2">
            <BalancePill balance={balance} />
            <SoundToggle size="sm" />
            <MapMenu showWallet={false} />
          </div>
        </header>
      )}

      <div
        ref={containerRef}
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-sky-100'
            : 'relative mt-3 w-full max-w-6xl overflow-hidden rounded-3xl border-8 border-white/70 bg-sky-100 shadow-xl'
        }
        style={{
          ...(isFullscreen ? {} : { height: 'min(720px, calc(100vh - 200px))', minHeight: 480 }),
          touchAction: 'none',
        }}
        aria-label="Gamecakes City 3D"
      />

      {/* "You are here" locator. */}
      {minimap ? <Minimap data={minimap} getPos={getMinimapPos} /> : null}

      {/* Zoom controls (touch-friendly; wheel/trackpad also zooms). Pinned to
          the right edge, vertically centered — clear of the kid badge (bottom-
          left), the feedback FAB (bottom-right), and the Play prompt (center). */}
      <div className="fixed right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2">
        <ChromeNavButton
          onClick={() => engineRef.current?.zoomBy(0.8)}
          aria-label="Zoom in"
          variant="dark"
          className="h-11 w-11 !px-0 text-2xl"
        >
          +
        </ChromeNavButton>
        <ChromeNavButton
          onClick={() => engineRef.current?.zoomBy(1.25)}
          aria-label="Zoom out"
          variant="dark"
          className="h-11 w-11 !px-0 text-2xl"
        >
          −
        </ChromeNavButton>
        {/* Spin the world so kids can look toward regions they haven't
            explored yet (the chase-cam otherwise only faces one way). */}
        <ChromeNavButton
          onClick={() => engineRef.current?.rotateBy(-Math.PI / 6)}
          aria-label="Spin world left"
          variant="dark"
          className="mt-1 h-11 w-11 !px-0 text-xl"
        >
          ↺
        </ChromeNavButton>
        <ChromeNavButton
          onClick={() => engineRef.current?.rotateBy(Math.PI / 6)}
          aria-label="Spin world right"
          variant="dark"
          className="h-11 w-11 !px-0 text-xl"
        >
          ↻
        </ChromeNavButton>
        {/* World camera — cycles chase → action → drone → sky, on foot and on
            every ride (the mode persists across mounting/dismounting). */}
        <ChromeNavButton
          onClick={onCycleCamera}
          aria-label={`Change camera angle — now: ${CAM_MODE_META[rideCam].label}`}
          title={CAM_MODE_META[rideCam].label}
          variant="dark"
          className="mt-1 h-11 w-11 !px-0 text-xl"
        >
          <span aria-hidden>{CAM_MODE_META[rideCam].glyph}</span>
        </ChromeNavButton>
      </div>

      {/* Floating "Play" prompt when standing by a game booth. Hidden during a
          story cutscene so it never overlaps the caption band. */}
      {!cutsceneStory && (nearGameMeta ? (
        <button
          type="button"
          onClick={() => doEnter(nearGameMeta.slug)}
          className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--act-from)', '--c-to': 'var(--act-to)', '--c-ink': 'var(--act-ink)', '--c-glow': 'var(--act-glow)' } as React.CSSProperties}
          aria-label={`Play ${nearGameMeta.label}`}
        >
          <span className="text-2xl" aria-hidden>
            {nearGameMeta.glyph}
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
              {nearRegionName ?? 'Play'}
            </span>
            <span>▶ Play {nearGameMeta.label}</span>
          </span>
        </button>
      ) : nearStore ? (
        <button
          type="button"
          onClick={() => doEnter('store:customize')}
          className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
          aria-label="Visit the Cakey Store"
        >
          <span className="text-2xl" aria-hidden>🧁</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
              Town Square
            </span>
            <span>▶ Visit the Cakey Store</span>
          </span>
        </button>
      ) : nearGarage ? (
        <button
          type="button"
          onClick={() => setGarageOpen(true)}
          className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--earn-from)', '--c-to': 'var(--earn-to)', '--c-ink': 'var(--earn-ink)', '--c-glow': 'var(--earn-glow)' } as React.CSSProperties}
          aria-label="Rent a ride at the Cakey Garage"
        >
          <span className="text-2xl" aria-hidden>🚙</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
              Town Square
            </span>
            <span>▶ Rent a ride</span>
          </span>
        </button>
      ) : nearLandUpgrade ? (
        <button
          type="button"
          onClick={() => setLandPanelOpen(true)}
          className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--grow-from)', '--c-to': 'var(--grow-to)', '--c-ink': 'var(--grow-ink)', '--c-glow': 'var(--grow-glow)' } as React.CSSProperties}
          aria-label="Grow my land"
        >
          <span className="text-2xl" aria-hidden>🏗️</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
              {ownedRegion?.name ?? 'My Land'}
            </span>
            <span>▶ Grow my land</span>
          </span>
        </button>
      ) : null)}

      {/* Sugar Express — hop on/off prompt. While riding, the Play prompt is
          suppressed (engine forces near-building null), so these never stack.
          Hidden during a story cutscene / a ferry crossing / a bus run so
          nothing overlaps. */}
      {!cutsceneStory && !ferrying && !busing && (riding ? (
        <button
          type="button"
          onClick={() => { engineRef.current?.exitTrain(); setRiding(false); }}
          className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--exit-from)', '--c-to': 'var(--exit-to)', '--c-ink': 'var(--exit-ink)', '--c-glow': 'var(--exit-glow)' } as React.CSSProperties}
          aria-label="Hop off the train"
        >
          <span className="text-2xl" aria-hidden>🛑</span>
          <span>Hop off the train</span>
        </button>
      ) : ridingVehicle ? (
        <button
          type="button"
          onClick={onDismountVehicle}
          className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--exit-from)', '--c-to': 'var(--exit-to)', '--c-ink': 'var(--exit-ink)', '--c-glow': 'var(--exit-glow)' } as React.CSSProperties}
          aria-label="Hop off your ride"
        >
          <span className="text-2xl" aria-hidden>
            {findVehicle(ridingVehicle)?.glyph ?? '🛑'}
          </span>
          <span>Hop off</span>
        </button>
      ) : (
        <div className="fixed fixed-bottom-safe-hi left-1/2 z-30 flex -translate-x-1/2 items-center gap-2">
          {/* Quick transport: hop straight onto a ride you've already rented
              today, from anywhere — no walking back to the Cakey Garage kiosk.
              These sit right beside the Sugar Express so both fast-travel
              options live together (kid ticket 2026-07-13). One glyph button
              per held rental; mountVehicle has no proximity gate. */}
          {[...rentals].map((kind) => {
            const info = findVehicle(kind);
            if (!info) return null;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onRideVehicle(kind)}
                className="candy-shell flex items-center rounded-full px-4 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
                style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
                aria-label={`Ride your ${info.label}`}
                title={`Ride your ${info.label}`}
              >
                <span className="text-2xl" aria-hidden>{info.glyph}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { if (engineRef.current?.boardTrain()) setRiding(true); }}
            className="candy-shell flex items-center gap-2 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
            style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
            aria-label="Ride the train"
          >
            <span className="text-2xl" aria-hidden>🚂</span>
            <span>Ride the Sugar Express</span>
          </button>
        </div>
      ))}

      {/* Cakey Ferry — appears at a dock. First crossing to Chess Island costs
          🪙1 and discovers it; return trips (once discovered) are free. */}
      {nearFerry && !riding && !ridingVehicle && !ferrying && !cutsceneStory ? (
        (() => {
          const chessKnown = discoveredSlugs.has('chess-club');
          // Price the trip with the SAME helper the server charges with. This
          // used to hardcode 1 (the fare) while the land itself was free; the
          // land is now priced too, so a hardcoded 1 would promise a fare and
          // debit a fare + an island.
          const chessPrice = arrivalPrice(findRegion('chess-club')?.unlock_cost ?? 0, 'ferry');
          const tooBroke = !chessKnown && balance < chessPrice;
          return (
            <button
              type="button"
              onClick={() => {
                if (engineRef.current?.boardFerry()) setFerrying(true);
              }}
              disabled={tooBroke}
              className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
              style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
              aria-label="Take the Cakey Ferry"
            >
              <span className="text-2xl" aria-hidden>⛴️</span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                  Cakey Ferry
                </span>
                <span className="flex items-center gap-1">
                  {chessKnown ? (
                    '▶ Ferry across'
                  ) : tooBroke ? (
                    <>
                      Need <SugarTokenIcon />{chessPrice} — play games!
                    </>
                  ) : (
                    <>
                      ▶ Ferry to Chess Island (<SugarTokenIcon />{chessPrice})
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })()
      ) : null}

      {/* Sugar Mile bus — appears at a stop. The bridge to Race Island is a ROAD:
          you cross it in a rented ride, or you ride the bus. The first crossing
          costs 🪙1 and discovers the island; every trip after that (including the
          one home) is free, so an empty wallet can never strand a kid offshore. */}
      {nearBus && !riding && !ridingVehicle && !ferrying && !busing && !cutsceneStory ? (
        (() => {
          const raceKnown = discoveredSlugs.has('race-pit-row');
          const racePrice = arrivalPrice(findRegion('race-pit-row')?.unlock_cost ?? 0, 'bus');
          const tooBroke = !raceKnown && balance < racePrice;
          return (
            <button
              type="button"
              onClick={() => {
                if (engineRef.current?.boardBus()) setBusing(true);
              }}
              disabled={tooBroke}
              className="candy-shell fixed fixed-bottom-safe left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full px-6 py-3 text-base font-display font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
              style={{ minHeight: 'var(--min-tap-target)', '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties}
              aria-label="Ride the Sugar Mile bus"
            >
              <span className="text-2xl" aria-hidden>🚌</span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                  Sugar Mile Bus
                </span>
                <span className="flex items-center gap-1">
                  {raceKnown ? (
                    '▶ Ride the bus'
                  ) : tooBroke ? (
                    <>
                      Need <SugarTokenIcon />{racePrice} — play games!
                    </>
                  ) : (
                    <>
                      ▶ Bus to Race Island (<SugarTokenIcon />{racePrice})
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })()
      ) : null}

      {/* Climb / dive — only while on a FLYING ride. Hold to trim altitude:
          skim low over the waves, or soar high to reach the sky-high treats and
          peek over the fogged lands. (The 🎥 world-camera button lives in the
          always-visible zoom cluster now.) Hidden during story cutscenes. */}
      {ridingVehicle && !cutsceneStory && findVehicle(ridingVehicle)?.control === 'fly' ? (
        <div className="fixed fixed-bottom-safe-hi right-4 z-30 flex flex-col gap-3">
          <button
            type="button"
            onPointerDown={() => engineRef.current?.setClimb(1)}
            onPointerUp={() => engineRef.current?.setClimb(0)}
            onPointerLeave={() => engineRef.current?.setClimb(0)}
            onPointerCancel={() => engineRef.current?.setClimb(0)}
            className="candy-shell flex touch-none select-none items-center justify-center rounded-full px-4 py-3 text-2xl transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-90"
            style={{
              minHeight: 'var(--min-tap-target)',
              minWidth: 'var(--min-tap-target)',
              '--c-from': 'var(--travel-from)',
              '--c-to': 'var(--travel-to)',
              '--c-ink': 'var(--travel-ink)',
              '--c-glow': 'var(--travel-glow)',
            } as React.CSSProperties}
            aria-label="Hold to climb higher"
            title="Hold to climb"
          >
            <span aria-hidden>⬆️</span>
          </button>
          <button
            type="button"
            onPointerDown={() => engineRef.current?.setClimb(-1)}
            onPointerUp={() => engineRef.current?.setClimb(0)}
            onPointerLeave={() => engineRef.current?.setClimb(0)}
            onPointerCancel={() => engineRef.current?.setClimb(0)}
            className="candy-shell flex touch-none select-none items-center justify-center rounded-full px-4 py-3 text-2xl transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-90"
            style={{
              minHeight: 'var(--min-tap-target)',
              minWidth: 'var(--min-tap-target)',
              '--c-from': 'var(--travel-from)',
              '--c-to': 'var(--travel-to)',
              '--c-ink': 'var(--travel-ink)',
              '--c-glow': 'var(--travel-glow)',
            } as React.CSSProperties}
            aria-label="Hold to dive lower"
            title="Hold to dive"
          >
            <span aria-hidden>⬇️</span>
          </button>
        </div>
      ) : null}

      {/* Thumb steering pad — left-thumb zone while mounted. Streams a
          magnitude-scaled steer vector to the engine; canvas drag still works. */}
      {ridingVehicle && !cutsceneStory ? (
        <ThumbPad onSteer={(v) => engineRef.current?.setPadSteer(v)} />
      ) : null}

      {/* (The old below-canvas "← Back to Map" pill is gone — it lived
          under a calc(100vh-200px) canvas where it was below the fold or
          buried under the fixed CakeyHint/Play prompts. Nav is in the
          header now.) */}

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

      {isStuck && !hintDismissed && !modalRegion && !pendingStory && !cutsceneStory ? (
        <CakeyHint onDismiss={() => setHintDismissed(true)} />
      ) : null}

      {/* Token-change card — a grown-up added/removed coins. Shown first (before
          the story toast) since it's timely news; queued one at a time. */}
      {currentNotice && !modalRegion && !stormPrompt && !storyCardStory && !cutsceneStory ? (
        <TokenNoticeCard notice={currentNotice} onDone={() => dismissNotice(currentNotice.id)} />
      ) : null}

      {/* Story Alert — a storybook toast announcing a world event (what + why).
          Watch OR dismiss both mark it seen. Gated out while a modal/storm/story
          beat or a token card owns the screen so it never fights for the screen. */}
      {storySeenReady && pendingStory && !currentNotice && !storyCardStory && !cutsceneStory && !modalRegion && !stormPrompt ? (
        <StoryAlert
          story={pendingStory}
          onWatch={() => {
            markStorySeen(pendingStory.slug);
            startCutscene(pendingStory);
          }}
          onDismiss={() => markStorySeen(pendingStory.slug)}
        />
      ) : null}

      {/* The narrated storybook card — the reduced-motion / no-camera path.
          Fires the land's reveal shimmer on open ONLY when the kid has already
          discovered it — revealRegion also unblocks entry, so we never re-reveal
          an unpaid land. */}
      {storyCardStory ? (
        <StoryCard
          story={storyCardStory}
          onReveal={
            storyCardStory.regionSlug && discoveredSlugs.has(storyCardStory.regionSlug)
              ? () => engineRef.current?.revealRegion(storyCardStory.regionSlug as string)
              : undefined
          }
          onDone={() => setStoryCardStory(null)}
        />
      ) : null}

      {/* The camera-cutscene caption band — carries the beats while the engine
          pans the camera to the land and back. Skip fast-forwards it home. */}
      {cutsceneStory ? (
        <StoryCutscene
          icon={cutsceneStory.icon}
          line={cutsceneStory.beats[Math.min(cutsceneBeat, cutsceneStory.beats.length - 1)]}
          onSkip={() => engineRef.current?.skipStoryCutscene()}
        />
      ) : null}

      {/* A storm re-locked a game land — pay to clear it, or wait it out. */}
      {stormPrompt ? (
        <StormModal
          landName={stormPrompt.name}
          cost={stormPrompt.cost}
          balance={balance}
          pending={stormPending}
          errorMessage={stormError}
          onCancel={() => setStormPrompt(null)}
          onConfirm={onConfirmClearStorm}
        />
      ) : null}

      {/* Cakey Garage — rent or hop on a cake ride. */}
      {garageOpen ? (
        <RentalModal
          balance={balance}
          rentals={rentals}
          pending={rentPending}
          errorMessage={rentError}
          onRent={onRentVehicle}
          onRide={onRideVehicle}
          onClose={() => {
            setGarageOpen(false);
            setRentError(undefined);
          }}
        />
      ) : null}

      {/* Welcome-home beat — a transient greeting when the OWNER arrives on
          their own land (on spawn + each walk-back). Owner-only: only rendered
          when the viewing kid owns the land they're standing on. */}
      {welcomeVisible && ownedRegion ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-24 z-30 -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-3xl border border-white/50 bg-white/95 px-5 py-3 shadow-xl backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
            <span className="text-3xl" aria-hidden>🏡</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {ownedRegion.name}
              </span>
              <span className="text-base font-extrabold text-zinc-800 dark:text-zinc-100">
                Welcome home{props.kidName ? `, ${props.kidName}` : ''}!
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Tap 🏗️ to grow your land.
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* In-world "Grow my land" panel — opened by the owner-only upgrade kiosk.
          Reuses the exact Store upgrade flow (POST /api/land/upgrade); on
          success we bump the shared wallet + the local stage AND rebuild the 3D
          structure LIVE (engine.refreshLandLevel) — the kid pays standing on
          their land, so the land must transform in front of them, not on the
          next page load. */}
      {landPanelOpen && ownedRegion ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Grow my land"
          onClick={() => setLandPanelOpen(false)}
        >
          <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLandPanelOpen(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-zinc-700 shadow-lg active:scale-95 dark:bg-zinc-800 dark:text-zinc-200"
            >
              ×
            </button>
            <LandEvolutionPanel
              ownedLand={{
                slug: ownedRegion.slug,
                name: ownedRegion.name,
                level: ownedLandLevel,
              }}
              balance={balance}
              onUpgraded={(newBalance) => {
                setBalance(newBalance);
                // Each upgrade advances exactly one stage. The panel re-renders
                // per upgrade, so this closure's ownedLandLevel is fresh.
                const next = ownedLandLevel + 1;
                setOwnedLandLevel(next);
                // Transform the land in-world right now: rebuild the structure
                // + garden at the new stage with a sprinkle burst + pop-in.
                engineRef.current?.refreshLandLevel(ownedRegion.slug, next);
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Cakey — the wandering mascot's follow bubble + tap-to-talk panel. */}
      <CakeyOverlay
        displayName={props.kidName}
        kidGrade={props.kidGrade ?? null}
        infoRef={cakeyInfoRef}
        open={cakeyPanelOpen}
        onClose={() => setCakeyPanelOpen(false)}
        onPauseChange={setCakeyPaused}
        weatherKind={weatherKind}
        onPlayStory={(slug) => {
          const s = findStory(slug);
          setCakeyPanelOpen(false);
          if (s) startCutscene(s);
        }}
        onOpenGarage={() => {
          // Close Cakey first, or the garage opens underneath his panel. Same
          // hand-off the story replay above does.
          setCakeyPanelOpen(false);
          setGarageOpen(true);
        }}
      />
    </main>
  );
}

/** Floating hint shown when the kid has fogged adjacent regions but can't
 *  afford any of them — points them back to playing games. */
function CakeyHint({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed fixed-bottom-safe-hi left-1/2 z-30 -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/40 bg-white/95 px-5 py-3 text-sm font-semibold text-zinc-800 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100">
        <span className="text-2xl" aria-hidden>
          🎂
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
            Cakey says
          </span>
          <span className="flex items-center gap-1">
            Play games to earn more <SugarTokenIcon />!
          </span>
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

/** Wallet pill — same shape as ParkMapHost so the chrome reads identically. */
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

// ---------------------------------------------------------------------------
// "You are here" minimap
// ---------------------------------------------------------------------------
//
// Draws the island silhouette + zone dots (from the engine's static geometry)
// and a pulsing marker at the live avatar position. The marker is driven by a
// requestAnimationFrame loop that reads getPos() and pokes the <circle> cx/cy
// directly, so it moves every frame WITHOUT re-rendering React.

function Minimap({
  data,
  getPos,
}: {
  data: TownMinimap;
  getPos: () => { nx: number; ny: number } | null;
}): React.ReactElement {
  const markerRef = useRef<SVGCircleElement | null>(null);

  // Frame dimensions (aspect-preserved by the engine): every coastline's extent
  // — the mainland AND the offshore isles, so Chess Island fits in frame.
  const allPts = [...data.outline, ...data.isles.flat()];
  const W = Math.max(...allPts.map((p) => p.nx));
  const H = Math.max(...allPts.map((p) => p.ny));
  const base = 118;
  const svgW = W >= H ? base : base * (W / H);
  const svgH = W >= H ? base * (H / W) : base;

  // getPos is a stable useCallback in the parent, so this effect runs once.
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const p = getPos();
      if (p && markerRef.current) {
        markerRef.current.setAttribute('cx', String(p.nx));
        markerRef.current.setAttribute('cy', String(p.ny));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getPos]);

  const poly = data.outline.map((p) => `${p.nx.toFixed(3)},${p.ny.toFixed(3)}`).join(' ');
  const islePolys = data.isles.map((isle) =>
    isle.map((p) => `${p.nx.toFixed(3)},${p.ny.toFixed(3)}`).join(' '),
  );

  return (
    <div className="pointer-events-none fixed left-3 top-20 z-30 select-none">
      <div className="rounded-2xl border border-white/60 bg-white/70 p-2 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/70">
        <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          You are here
        </div>
        <svg width={svgW} height={svgH} viewBox={`${-W * 0.06} ${-H * 0.06} ${W * 1.12} ${H * 1.12}`}>
          {/* Water backdrop — the bean doesn't fill the corners. */}
          <rect x={-W * 0.06} y={-H * 0.06} width={W * 1.12} height={H * 1.12} rx={W * 0.06} fill="#a7dcf2" />
          {/* Island silhouettes — the mainland + each offshore isle (Chess),
              so a separate island reads as a destination, not a stray dot. */}
          <polygon points={poly} fill="#a7e6b0" stroke="#7cc98a" strokeWidth={W * 0.02} strokeLinejoin="round" />
          {islePolys.map((pts, i) => (
            <polygon
              key={i}
              points={pts}
              fill="#a7e6b0"
              stroke="#7cc98a"
              strokeWidth={W * 0.02}
              strokeLinejoin="round"
            />
          ))}
          {/* Dotted ferry route across the open sea — how you get there. */}
          {data.ferryRoute ? (
            <line
              x1={data.ferryRoute.a.nx}
              y1={data.ferryRoute.a.ny}
              x2={data.ferryRoute.b.nx}
              y2={data.ferryRoute.b.ny}
              stroke="#a855f7"
              strokeWidth={W * 0.014}
              strokeDasharray={`${W * 0.028} ${W * 0.024}`}
              strokeLinecap="round"
            />
          ) : null}
          {/* Zone dots — pink when discovered, grey while still fogged. */}
          {data.zones.map((z, i) => (
            <circle
              key={i}
              cx={z.nx}
              cy={z.ny}
              r={W * 0.03}
              fill={z.discovered ? '#f472b6' : '#cbd2d9'}
              stroke="#ffffff"
              strokeWidth={W * 0.009}
            />
          ))}
          {/* You-are-here marker (position poked in via rAF). */}
          <circle ref={markerRef} cx={W / 2} cy={H / 2} r={W * 0.055} fill="#ef4444" stroke="#ffffff" strokeWidth={W * 0.016}>
            <animate attributeName="r" values={`${W * 0.05};${W * 0.075};${W * 0.05}`} dur="1.2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
  );
}
