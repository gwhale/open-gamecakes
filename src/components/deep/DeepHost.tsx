'use client';

// DeepHost — the React shell around the Sunken Batterlands engine.
//
// Modelled on ThreeTownHost: the host owns the engine instance, so engine to
// React is direct callbacks and React to engine is direct method calls, with no
// event bus in between. `three` and the engine are dynamic-imported inside a
// useEffect so no WebGL reaches the server bundle — the same bundle-hygiene
// rule the town and every 3D game shell follow.
//
// The host owns ALL input. The engine is handed a normalised SubInput and never
// learns whether it came from a key or a thumb, which is the only way the
// keyboard path and the iPad path can be guaranteed to behave the same.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import GamecakesLogo from '@/components/GamecakesLogo';
import ThumbPad from '@/components/town/ThumbPad';
import SpokenText from '@/components/town/SpokenText';
import SubPad from '@/components/deep/SubPad';
import ChestGate, { type GrantedItem } from '@/components/deep/ChestGate';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';
import { playTap, playStart, playBubble } from '@/lib/games/shared/sounds';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { radioLine, itemLine, type RadioMoment } from '@/lib/deep/cakey-radio';
import type { DeepEngine } from '@/lib/deep/engine';
import type { SonarReturn } from '@/lib/deep/sonar';
import { SONAR_MARK_S, type DeepSpawn } from '@/lib/deep/types';

export default function DeepHost({
  spawn,
  found = [],
  bestDepthM = 0,
}: {
  /** Saved pose, when the kid was here recently. Omit to start at the reef. */
  spawn?: DeepSpawn;
  /** Landmark slugs already found. */
  found?: readonly string[];
  /** Deepest they have ever been (metres). */
  bestDepthM?: number;
}): React.ReactElement {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DeepEngine | null>(null);

  const [depth, setDepth] = useState(0);
  const [sonarReady, setSonarReady] = useState(true);
  const [returns, setReturns] = useState<SonarReturn[]>([]);
  const [nearLandmark, setNearLandmark] = useState<{ id: string; prompt: string } | null>(null);
  const [atLimit, setAtLimit] = useState(false);
  const [say, setSay] = useState('');
  const [gateFor, setGateFor] = useState<string | null>(null);
  // Rounded on the way in. deepest_m is stored as a raw double, so seeding
  // straight from it rendered "DEEPEST 109.72596793167M" across the HUD until
  // the kid happened to beat it. The engine rounds its copy for the same
  // reason — see bestDepth in engine.ts.
  const [record, setRecord] = useState(Math.round(bestDepthM));
  const [brokeRecord, setBrokeRecord] = useState(false);

  // What this kid has already found. A ref, not state: it is read inside engine
  // callbacks bound once at mount, and nothing renders off it.
  const foundRef = useRef(new Set<string>(found));
  /** True on the first pose save of this dive — bumps the dives counter. */
  const firstSave = useRef(true);

  // Index of the last line spoken per moment, so Cakey does not repeat himself
  // immediately. Mirrors how the town's overlay tracks ambient lines.
  const lastLine = useRef<Partial<Record<RadioMoment, number>>>({});
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A sonar return has to DIE, on the same clock as the halo it refers to.
  // Leaving it up was the single worst bug in the first playtest: after a
  // kilometre of driving the HUD still read "163m southeast", which is both
  // wrong and exactly the persistent marker the whole design refuses to have.
  // A stale bearing is worse than no bearing — it sends a kid the wrong way.
  const showReturns = useCallback((r: SonarReturn[]): void => {
    setReturns(r);
    if (returnsTimer.current) clearTimeout(returnsTimer.current);
    if (r.length > 0) {
      returnsTimer.current = setTimeout(() => setReturns([]), SONAR_MARK_S * 1000);
    }
  }, []);

  /** Put a line in the bubble and start its clock. */
  const utter = useCallback((line: string): void => {
    setSay(line);
    // The bubble has to go away on its own. A line that stays on screen stops
    // being Cakey talking and becomes a label bolted to the HUD — and the next
    // one then reads as an edit rather than a new thing said. Roughly reading
    // speed, with a floor so a short line is not a flash.
    if (sayTimer.current) clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSay(''), 2600 + line.length * 45);
  }, []);

  const speak = useCallback(
    (moment: RadioMoment): void => {
      const { line, index } = radioLine(moment, lastLine.current[moment] ?? -1);
      lastLine.current[moment] = index;
      utter(line);
    },
    [utter],
  );

  /** What he says about the thing that just came out of a chest. Keyed by ITEM
   *  rather than by moment, because the whole point is that a carton of eggs
   *  gets a different reaction from a tin of sugar. */
  const lastItemLine = useRef<Record<string, number>>({});
  const speakItem = useCallback(
    (itemSlug: string): void => {
      const { line, index } = itemLine(itemSlug, lastItemLine.current[itemSlug] ?? -1);
      lastItemLine.current[itemSlug] = index;
      utter(line);
    },
    [utter],
  );
  const speakItemRef = useRef(speakItem);
  speakItemRef.current = speakItem;

  useEffect(() => () => {
    if (sayTimer.current) clearTimeout(sayTimer.current);
    if (returnsTimer.current) clearTimeout(returnsTimer.current);
  }, []);

  // Keep the latest speak/router in refs: the engine's callbacks are bound once
  // at mount, and re-creating the engine to pick up a new closure would rebuild
  // the entire ocean.
  const speakRef = useRef(speak);
  speakRef.current = speak;

  /** Fire-and-forget pose save. Best-effort by design — a dropped save costs
   *  at most one resumed position, and the route answers 204 either way. */
  const savePose = useCallback(
    (pose: { x: number; y: number; z: number; heading: number; depth: number }): void => {
      const first = firstSave.current;
      firstSave.current = false;
      void fetch('/api/deep/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pose, first }),
        keepalive: true,
      }).catch(() => {
        // The next emit retries.
      });
    },
    [],
  );
  const savePoseRef = useRef(savePose);
  savePoseRef.current = savePose;
  const showReturnsRef = useRef(showReturns);
  showReturnsRef.current = showReturns;
  // ---- The chest gate ----
  // Which chest is asking its three questions, if any. The engine's callbacks
  // are bound once at mount, so the opener goes through a ref like every other
  // callback the engine holds on to.
  const openGate = useCallback((slug: string): void => {
    setGateFor(slug);
    // Stop the ocean while the dialog is up. A submarine drifting into the
    // canyon behind a maths question is a bad surprise to come back to.
    engineRef.current?.setPaused(true);
  }, []);
  const openGateRef = useRef(openGate);
  openGateRef.current = openGate;

  const closeGate = useCallback((): void => {
    setGateFor(null);
    engineRef.current?.setPaused(false);
  }, []);

  /** The chest opened: swing the lid, remember it, and let Cakey react. */
  const handleOpened = useCallback((slug: string, item: GrantedItem | null): void => {
    foundRef.current.add(slug);
    engineRef.current?.openChest(slug);
    // He reacts to the ITEM now, not to the fact that a box opened. Nine of the
    // ten used to share one line, which made the ninth chest sound like the
    // second. If the grant somehow arrived without an item, the generic chest
    // lines are still the right thing to say.
    if (item) speakItemRef.current(item.slug);
    else speakRef.current('chest');
  }, []);

  // Where the sub currently is, for the ambient line. A ref, not state: it
  // changes on a callback bound once at mount and nothing renders off it.
  const bandRef = useRef<'reef' | 'drop' | 'canyon'>('reef');

  // ---- Mount the engine ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let engine: DeepEngine | null = null;
    let cancelled = false;

    void (async () => {
      const [THREE, mod] = await Promise.all([
        import('three'),
        import('@/lib/deep/engine'),
      ]);
      // The kid may have hit Back while the chunks were in flight.
      if (cancelled) return;

      engine = mod.createDeepEngine(
        THREE,
        container,
        {
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          spawn,
          found,
          bestDepthM,
        },
        {
          onDepth: setDepth,
          onSonar: (r) => {
            showReturnsRef.current(r);
            speakRef.current(r.length > 0 ? 'sonar-hit' : 'sonar-empty');
          },
          onSonarReady: () => setSonarReady(true),
          onNearLandmark: setNearLandmark,
          onInteract: (id) => {
            playBubble();
            hapticSuccess();
            // A chest already opened is just a thing to say hello to again --
            // no questions, no second grant. This is the only place a saved
            // discovery is VISIBLE, and the whole reason the row is worth
            // writing.
            if (foundRef.current.has(id)) {
              // The whisk keeps its own lines. It is the one Cakey has a story
              // about -- 'I forget my own recipe' -- and the other nine are
              // crates he is meeting for the first time.
              speakRef.current(id === 'sunken-whisk' ? 'whisk-again' : 'chest-again');
              return;
            }
            // A shut chest asks three questions first. The engine no longer
            // swings the lid on tap; the gate does it on the way out.
            openGateRef.current(id);
          },
          onDepthLimit: (limited) => {
            setAtLimit(limited);
            if (limited) speakRef.current('depth-limit');
          },
          onPositionUpdate: (pose) => savePoseRef.current(pose),
          onNewRecord: (depthM) => {
            setRecord(depthM);
            setBrokeRecord(true);
          },
          onBand: (band) => {
            const first = bandRef.current !== band;
            bandRef.current = band;
            // Crossing INTO the drop or the canyon is an event worth remarking
            // on. Arriving in the reef is not — that is where you started, and
            // it gets the ambient line below instead.
            if (first && band !== 'reef') speakRef.current(band === 'drop' ? 'drop' : 'canyon');
          },
        },
      );
      engineRef.current = engine;
      speakRef.current('descent');
    })();

    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // Mount once — spawn/found/bestDepthM are the state of the world AT BOOT
    // and must not re-run this, or a save landing mid-dive would tear down the
    // ocean and rebuild it under the kid. To re-spawn, remount the host. Same
    // rule, and the same comment, as ThreeTownHost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Ambient chatter ----
  // Deliberately sparse, and deliberately RANDOM rather than on a fixed beat.
  // The town's own code says it best: a nag heard every time is a nag nobody
  // hears. One line in three attempts, no more than about one a minute, and
  // never while something else is already on screen.
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.34) return;
      setSay((current) => {
        if (current) return current; // he is already talking; do not interrupt
        speakRef.current(bandRef.current);
        return current;
      });
    }, 21000);
    return () => clearInterval(id);
  }, []);

  // ---- Keep the canvas sized ----
  useEffect(() => {
    const onResize = () => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---- Sonar ----
  const fireSonar = useCallback((): void => {
    if (!engineRef.current?.pingSonar()) return;
    setSonarReady(false);
    setReturns([]);
    playTap();
    hapticTap();
  }, []);

  // ---- Keyboard. The PRD's layout, kept as the secondary path. ----
  useEffect(() => {
    const held = new Set<string>();

    const apply = (): void => {
      const e = engineRef.current;
      if (!e) return;
      const axis = (pos: string[], neg: string[]): number =>
        (pos.some((k) => held.has(k)) ? 1 : 0) - (neg.some((k) => held.has(k)) ? 1 : 0);
      e.setInput({
        throttle: axis(['w', 'arrowup'], ['s', 'arrowdown']),
        steer: axis(['d', 'arrowright'], ['a', 'arrowleft']),
        climb: axis(['e'], ['q']),
        boost: held.has('shift'),
      });
    };

    const onDown = (ev: KeyboardEvent): void => {
      const k = ev.key.toLowerCase();
      if (k === ' ') {
        ev.preventDefault();
        fireSonar();
        return;
      }
      if (k === 'f') {
        engineRef.current?.interact();
        return;
      }
      held.add(k);
      apply();
    };
    const onUp = (ev: KeyboardEvent): void => {
      held.delete(ev.key.toLowerCase());
      apply();
    };
    // A tab switch never delivers keyup, so without this the sub drives itself
    // off into the dark while the kid is somewhere else.
    const onBlur = (): void => {
      held.clear();
      apply();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [fireSonar]);

  // ---- Touch: left thumb steers and throttles ----
  const onSteer = useCallback((v: { x: number; y: number } | null): void => {
    engineRef.current?.setInput(
      v
        ? // Screen-space y is DOWN, so pushing the knob up (negative y) is
          // ahead. Steering takes the raw x: a gentle push creeps.
          { throttle: -v.y, steer: v.x }
        : { throttle: 0, steer: 0 },
    );
  }, []);

  const surface = useCallback((): void => {
    playStart();
    speakRef.current('surface');
    // Save on the way out. The 4-second timer alone would throw away up to
    // four seconds of driving at exactly the moment the position matters most
    // — the same save-then-navigate contract the town uses for game booths.
    const pose = engineRef.current?.getState();
    if (pose) savePose(pose);
    router.push('/town');
  }, [router, savePose]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#031b33]">
      <div ref={containerRef} className="absolute inset-0" />

      {gateFor ? (
        <ChestGate
          chestSlug={gateFor}
          onOpened={(item) => handleOpened(gateFor, item)}
          onClose={closeGate}
        />
      ) : null}

      {/* ---- Chrome ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <GamecakesLogo />
          <ChromeNavButton onClick={surface} aria-label="Surface and return to the cove">
            ↑ Surface
          </ChromeNavButton>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <SoundToggle />
          <FullscreenToggle />
        </div>
      </div>

      {/* ---- Depth meter. The one number that is always on screen, because
              depth is the whole subject of the place.
              Underneath it, the kid's deepest EVER — a record, not a checklist.
              The PRD's real success metric is a kid asking whether they can go
              deeper, and a number that only goes up is the cheapest honest way
              to ask them that every single dive. It is hidden until they have
              actually been somewhere, so a first dive is not shadowed by a
              zero. ---- */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-2xl bg-black/40 px-4 py-1.5 text-center font-display backdrop-blur-sm">
        <div className="text-[10px] uppercase tracking-widest text-white/70">Depth</div>
        <div className="text-2xl font-bold leading-none text-white tabular-nums">{depth}m</div>
        {record > 0 ? (
          <div
            className={`mt-1 text-[10px] font-bold uppercase tracking-wider tabular-nums transition-colors duration-300 ${
              brokeRecord ? 'text-amber-300' : 'text-white/55'
            }`}
          >
            {brokeRecord ? 'New deepest ' : 'Deepest '}
            {record}m
          </div>
        ) : null}
      </div>

      {/* ---- Sonar returns. Bearing and range only, and they vanish with the
              next pulse — there is no list, no log and no map on purpose. ---- */}
      {returns.length > 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 space-y-1 text-center">
          {returns.map((r) => (
            <div
              key={r.id}
              className="rounded-full bg-emerald-400/20 px-4 py-1.5 font-display text-sm font-bold text-emerald-100 backdrop-blur-sm"
            >
              PING → {r.echo} · {r.range}m · {r.bearing}
            </div>
          ))}
        </div>
      ) : null}

      {/* ---- The wall, and what is under it. ---- */}
      {atLimit ? (
        // Sits ABOVE the submarine, not on it. Centred vertically, it landed
        // squarely across the hull and neither the words nor the boat could be
        // read. It also carries its own scrim: this fires in the darkest water
        // in the game, where white-on-navy is the one thing that has to stay
        // legible.
        <div className="pointer-events-none absolute left-1/2 top-[26%] z-30 -translate-x-1/2 rounded-2xl bg-black/45 px-6 py-3 text-center backdrop-blur-sm">
          <div className="font-display text-xl font-bold tracking-wide text-white drop-shadow-lg">
            DEPTH LIMIT REACHED
          </div>
          <div className="mt-1 text-sm italic text-white/85">
            Sub-Cake One cannot safely descend farther.
          </div>
        </div>
      ) : null}

      {/* ---- Cakey on the radio ---- */}
      {say ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-40 z-30 flex justify-center px-6">
          <div className="candy-shell max-w-sm rounded-3xl px-5 py-3 text-center font-display text-sm font-bold">
            <SpokenText text={say} />
          </div>
        </div>
      ) : null}

      {/* ---- Interact ---- */}
      {nearLandmark ? (
        <button
          type="button"
          onClick={() => engineRef.current?.interact()}
          className="candy-shell fixed bottom-56 left-1/2 z-30 -translate-x-1/2 rounded-full px-6 py-3 font-display text-base font-bold transition-transform duration-100 ease-out active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          🔍 {nearLandmark.prompt}
        </button>
      ) : null}

      {/* ---- Controls ---- */}
      <ThumbPad onSteer={onSteer} />
      <SubPad
        onClimb={(dir) => engineRef.current?.setInput({ climb: dir })}
        onBoost={(on) => engineRef.current?.setInput({ boost: on })}
        onSonar={fireSonar}
        sonarReady={sonarReady}
      />
    </div>
  );
}
