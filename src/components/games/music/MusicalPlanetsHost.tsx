'use client';

// Musical Planets — the circle of fifths as a place to fly around.
//
// The whole game is one three.js scene (lib/games/three/planets/engine.ts):
// twelve candy planets round a sun, Cakey's rocket, and on each planet a staff
// and a piano you can play. This file is the lesson and the HUD over it:
// which mission is on, what Cakey says, what the synth plays, and which keys
// and notes the scene lights up. One selected key drives everything on screen;
// the only time the views may differ is "match the sign", where the staff
// floats over the circle showing a mystery key until the kid taps its planet.
//
// Missions, hints and words come from lib/games/music/missions.ts; musical
// facts from theory.ts. Progress is kept on the device (progress.ts) and never
// posted: no account needed, no attempts row, no tokens.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Noto_Music } from 'next/font/google';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import SoundToggle from '@/components/SoundToggle';
import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useGameBackTarget } from '@/lib/games/use-game-back-target';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { webglAvailable } from '@/lib/webgl';
import { playJetskiWhoosh } from '@/lib/games/shared/sounds';
import {
  CIRCLE,
  changedNotes,
  degree,
  keyName,
  keyOf,
  majorScale,
  midiOf,
  pcName,
  pcOf,
  pianoKeys,
  signatureWords,
  spellInKey,
  tonicTriad,
  type KeyId,
  type PitchClass,
} from '@/lib/games/music/theory';
import {
  LESSON_KEYS,
  MAX_HINT,
  MISSIONS,
  fifthDone,
  fifthWalk,
  findHit,
  findMiss,
  hintFor,
  instruction,
  introDone,
  isHomeDegree,
  isMissionOpen,
  matchHit,
  matchMiss,
  nextMission,
  phrasePitches,
  tuneHit,
  tuneMiss,
  unlockedKeys,
  type Mission,
} from '@/lib/games/music/missions';
import { DEFAULT_PROGRESS, loadProgress, saveProgress, type MusicProgress } from '@/lib/games/music/progress';
import { MusicPlayer, chord, sequence, type PlayEvent } from '@/lib/games/music/synth';
import { MUSICAL_PLANETS_GLYPH, MUSICAL_PLANETS_NAME } from '@/lib/games/music/name';
import type { PlanetLook, PlanetsEngine } from '@/lib/games/three/planets/engine';

const notoMusic = Noto_Music({ weight: '400', subsets: ['music'], display: 'swap' });

export interface MusicalPlanetsHostProps {
  gameSlug: string;
  kidName?: string;
  /** Passed by the guest arcade; unused (the name is a constant). */
  title?: string;
}

type Tone = 'info' | 'good' | 'try' | 'win';
type Mode = 'space' | 'planet';

interface MissionState {
  hint: number;
  /** Fifth walk: notes tapped so far. Match: the round. */
  step: number;
  /** Match: this round's answer is in. */
  answered: boolean;
  done: boolean;
}

const FRESH: MissionState = { hint: 0, step: 0, answered: false, done: false };
const KEYS = pianoKeys();
const idx = (id: KeyId): number => CIRCLE.indexOf(id);

/** The computer keyboard as a piano, the usual way: the home row is the white
 *  keys from C4, the row above it the black keys. */
const QWERTY: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72, o: 73, l: 74, p: 75, ';': 76,
};

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(fn: () => void): () => void {
  const mq = window.matchMedia?.(REDUCED_QUERY);
  mq?.addEventListener('change', fn);
  return () => mq?.removeEventListener('change', fn);
}

function useOsReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia?.(REDUCED_QUERY).matches === true,
    () => false,
  );
}

export default function MusicalPlanetsHost({ gameSlug, kidName }: MusicalPlanetsHostProps) {
  const back = useGameBackTarget();
  const backHref = back?.href ?? '/games';

  const [progress, setProgress] = useState<MusicProgress>(DEFAULT_PROGRESS);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<KeyId>('C');
  const [mode, setMode] = useState<Mode>('space');
  const [mission, setMission] = useState<Mission | null>(null);
  const [ms, setMs] = useState<MissionState>(FRESH);
  const [say, setSay] = useState<{ text: string; tone: Tone } | null>(null);
  const [lit, setLit] = useState<readonly number[]>([]);
  const [litScaleIdx, setLitScaleIdx] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [link, setLink] = useState<readonly [KeyId, KeyId] | null>(null);
  const [panel, setPanel] = useState<'missions' | 'settings' | null>(null);
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const fontProbeRef = useRef<HTMLSpanElement | null>(null);
  const engineRef = useRef<PlanetsEngine | null>(null);

  // Read by playback callbacks, which outlive the render that scheduled them.
  const doneRef = useRef(false);
  useEffect(() => { doneRef.current = ms.done; }, [ms.done]);

  const osReduced = useOsReducedMotion();
  const reduced = osReduced || progress.settings.calm;
  const hideNames = progress.settings.hideLabels;

  const playerRef = useRef<MusicPlayer | null>(null);
  const player = (): MusicPlayer => (playerRef.current ??= new MusicPlayer());

  // ---- device progress (read after mount so SSR and first paint agree) ----
  useEffect(() => { setProgress(loadProgress()); }, []);
  useEffect(() => { player().setVolume(progress.settings.volume); }, [progress.settings.volume]);
  useEffect(() => () => playerRef.current?.dispose(), []);

  const updateProgress = useCallback((fn: (p: MusicProgress) => MusicProgress) => {
    setProgress((p) => {
      const next = fn(p);
      saveProgress(next);
      return next;
    });
  }, []);

  const completed = progress.completed;
  const unlocked = unlockedKeys(completed);

  const looks = useMemo<PlanetLook[]>(() => CIRCLE.map((id) => {
    const here = MISSIONS.filter((m) => m.key === id);
    return {
      status: unlocked.includes(id) ? 'open' : LESSON_KEYS.includes(id) ? 'locked' : 'future',
      done: here.filter((m) => completed.includes(m.id)).length,
      total: here.length,
    };
  }), [unlocked, completed]);
  const looksRef = useRef(looks);
  looksRef.current = looks;

  // ---- the 3D scene ----
  useEffect(() => {
    let destroyed = false;
    if (!webglAvailable()) { setEngineState('failed'); return; }
    (async () => {
      try {
        const [THREE, mod] = await Promise.all([import('three'), import('@/lib/games/three/planets/engine')]);
        if (destroyed || !containerRef.current) return;
        const displayFont = fontProbeRef.current ? getComputedStyle(fontProbeRef.current).fontFamily : 'sans-serif';
        const engine = await mod.createPlanetsEngine(
          THREE,
          containerRef.current,
          { looks: looksRef.current, reducedMotion: reduced, displayFont, musicFont: notoMusic.style.fontFamily },
          {
            onPlanetTap: (i) => planetTapRef.current(i),
            onKeyDown: (midi) => keyDownRef.current(midi),
          },
        );
        if (destroyed) { engine.dispose(); return; }
        engineRef.current = engine;
        setEngineState('ready');
      } catch (err) {
        console.warn('[musical-planets] 3D unavailable:', err);
        if (!destroyed) setEngineState('failed');
      }
    })();
    const onResize = (): void => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (containerRef.current) ro?.observe(containerRef.current);
    return () => {
      destroyed = true;
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // Mount once; later state reaches the engine through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- playback: every take lights the keys and captions what sounds ----
  const play = useCallback((events: PlayEvent[], opts: { scale?: boolean; onEnd?: () => void } = {}) => {
    setLit([]);
    setLitScaleIdx(null);
    player().play(events, {
      onEvent: (ev, i) => {
        setLit(ev.midis);
        setCaption(ev.label);
        if (opts.scale) setLitScaleIdx(i);
      },
      onEnd: () => {
        setLit([]);
        setLitScaleIdx(null);
        opts.onEnd?.();
      },
    });
  }, []);

  const playChord = useCallback((id: KeyId) => play(chord(tonicTriad(keyOf(id)))), [play]);
  const scaleEvents = (id: KeyId): PlayEvent[] => sequence(majorScale(keyOf(id)).map((pitch, i) => ({ pitch, beats: i === 7 ? 2 : 1 })));

  // ---- flying ----
  const fly = useCallback(async (to: Mode, key: KeyId, staff = false): Promise<void> => {
    setMode(to);
    const e = engineRef.current;
    if (!e) return;
    setBusy(true);
    try {
      await e.setView(to === 'planet' ? { mode: 'planet', planet: idx(key) } : { mode: 'space', planet: idx(key), staff });
    } finally {
      setBusy(false);
    }
  }, []);

  // ---- missions ----
  const complete = useCallback((m: Mission) => {
    hapticSuccess();
    engineRef.current?.celebrate();
    updateProgress((p) => {
      if (p.completed.includes(m.id)) return p;
      const done = [...p.completed, m.id];
      if (!introDone(p.completed) && introDone(done)) {
        // The C introduction just finished: open G and F where the kid can see it.
        window.setTimeout(() => {
          engineRef.current?.pulse(idx('G'));
          window.setTimeout(() => engineRef.current?.pulse(idx('F')), 450);
        }, 900);
      }
      return { ...p, completed: done };
    });
  }, [updateProgress]);

  const startMission = useCallback((m: Mission) => {
    setMission(m);
    setMs(FRESH);
    setSay(null);
    setLink(null);
    setPanel(null);
    player().stop();
    if (m.kind === 'match') {
      void fly('space', selected, true);
      return;
    }
    setSelected(m.key);
    void fly('planet', m.key).then(() => {
      if (m.kind === 'tune') play(sequence(phrasePitches(m.key, m.phrase)));
      else playChord(m.key);
    });
  }, [fly, play, playChord, selected]);

  const begin = (): void => {
    player().unlock();
    setStarted(true);
    startMission(nextMission(completed) ?? MISSIONS[0]);
  };

  const bumpHint = (): void => setMs((s) => ({ ...s, hint: Math.min(MAX_HINT, s.hint + 1) }));

  // The key the staff shows. Only "match" may hide the real one.
  const mysteryKey = mission?.kind === 'match' && !ms.done ? mission.rounds[ms.step % mission.rounds.length] : null;
  const viewKey: KeyId = mysteryKey && !ms.answered ? mysteryKey : selected;
  const hiding = mysteryKey !== null && !ms.answered;

  const goToMap = (): void => {
    player().stop();
    if (mission && mission.kind !== 'match' && !ms.done) setMission(null);
    setSay(null);
    void fly('space', selected);
  };

  // ---- the circle ----
  const onPlanetTap = (i: number): void => {
    const id = CIRCLE[i];
    hapticTap();
    if (mission?.kind === 'match' && !ms.done) {
      if (ms.answered) { setSay({ text: 'Tap “Next sign” for another one!', tone: 'info' }); return; }
      onMatch(id);
      return;
    }
    const st = looks[i].status;
    if (st === 'locked') {
      engineRef.current?.shake(i);
      setSay({ text: `${keyName(keyOf(id))} opens after the C major missions. Almost there!`, tone: 'info' });
      return;
    }
    if (st === 'future') {
      engineRef.current?.shake(i);
      setSay({ text: `${keyName(keyOf(id))} is a planet for later. It has ${signatureWords(keyOf(id))}.`, tone: 'info' });
      return;
    }
    if (mission?.kind === 'match') setMission(null);
    setSelected(id);
    setLink(null);
    setSay(null);
    void fly('planet', id).then(() => playChord(id));
  };

  // ---- the piano ----
  const onPress = (midi: number): void => {
    const key = keyOf(viewKey);
    const raw = KEYS.find((k) => k.midi === midi)!.natural;
    const spelled = spellInKey(key, midi);
    // C, G and F never respell across an octave (no B♯ or C♭), so the piano
    // key's own octave is the note's.
    const pitch = spelled ? { ...spelled, octave: raw.octave } : raw;
    const tapped: PitchClass = spelled ?? raw;
    const tapNote = (): void => play(sequence([{ pitch, beats: 1.6 }]));

    if (!mission || ms.done || mode !== 'planet') { tapNote(); return; }

    if (mission.kind === 'tune') {
      const deg = mission.phrase.choices.find((d) => midiOf(degree(keyOf(mission.key), d)) === midi);
      if (deg !== undefined) onTune(deg);
      else tapNote();
      return;
    }

    if (mission.kind === 'find') {
      tapNote();
      if (pcOf(tapped) === pcOf(mission.target)) {
        setSay({ text: findHit(mission), tone: 'win' });
        setMs((s) => ({ ...s, done: true }));
        engineRef.current?.pulse(idx(mission.key));
        complete(mission);
      } else {
        setSay({ text: findMiss(mission, tapped), tone: 'try' });
        bumpHint();
      }
      return;
    }

    if (mission.kind === 'fifth') {
      const walk = fifthWalk(mission);
      // All five are in and the rocket is on its way: keys just play.
      if (ms.step >= walk.length) { tapNote(); return; }
      const want = walk[ms.step];
      if (pcOf(tapped) !== pcOf(want)) {
        play(sequence([{ pitch, beats: 1.2 }]));
        setSay({ text: `That’s ${pcName(tapped)}. We’re counting ${mission.direction === 'up' ? 'up' : 'down'}: next is ${pcName(want)}.`, tone: 'try' });
        bumpHint();
        return;
      }
      const n = ms.step + 1;
      if (n < walk.length) {
        play(sequence([{ pitch: want, beats: 1.2 }]));
        setMs((s) => ({ ...s, step: n, hint: 0 }));
        setSay({ text: `${n}… ${pcName(want)}!`, tone: 'good' });
        return;
      }
      // Five! Play the whole walk, then the rocket flies to the new planet
      // and its chord rings out on landing.
      const m = mission;
      const to = m.to;
      setMs((s) => ({ ...s, step: n, hint: 0 }));
      setSay({ text: `${n}… ${pcName(want)}! Five notes! Blast off!`, tone: 'good' });
      const walkEv = sequence(walk.map((p) => ({ pitch: p, beats: 0.8 })));
      play(walkEv, {
        onEnd: () => {
          const e = engineRef.current;
          setSelected(to);
          setLink([m.key, to]);
          setMode('planet');
          setBusy(true);
          playJetskiWhoosh();
          const landed = e ? e.travel(idx(m.key), idx(to)) : Promise.resolve();
          void landed.finally(() => {
            setBusy(false);
            setMs((s) => ({ ...s, done: true }));
            playChord(to);
            setSay({ text: fifthDone(m), tone: 'win' });
            complete(m);
          });
        },
      });
      return;
    }

    tapNote();
  };

  // ---- mission buttons ----
  const onHearScale = (): void => {
    const m = mission;
    const id = viewKey;
    play(scaleEvents(id), {
      scale: true,
      onEnd: () => {
        if (m?.kind === 'explore' && m.key === id) {
          if (doneRef.current) return;
          doneRef.current = true;
          setMs((s) => ({ ...s, done: true }));
          complete(m);
          const changed = changedNotes(keyOf(id));
          setSay({
            text: changed.length === 0
              ? `That’s the C major scale: all white keys, from home to home!`
              : `That’s ${keyName(keyOf(id))}! Did you see ${pcName(changed[0])} light up? That’s the ${changed[0].acc === 1 ? 'sharp' : 'flat'} from the key signature.`,
            tone: 'win',
          });
          engineRef.current?.pulse(idx(id));
        }
      },
    });
  };

  const onMatch = (pick: KeyId): void => {
    if (mission?.kind !== 'match' || ms.answered || !mysteryKey) return;
    if (pick === mysteryKey) {
      setMs((s) => ({ ...s, answered: true, hint: 0 }));
      setSelected(pick);
      setSay({ text: matchHit(pick), tone: 'win' });
      engineRef.current?.pulse(idx(pick));
      engineRef.current?.celebrate();
      hapticSuccess();
      void fly('space', pick, true);
      play(scaleEvents(pick), { scale: true });
    } else {
      engineRef.current?.shake(idx(pick));
      setSay({ text: matchMiss(mysteryKey, pick), tone: 'try' });
      bumpHint();
    }
  };

  const onMatchNext = (): void => {
    if (mission?.kind !== 'match') return;
    const n = ms.step + 1;
    if (n >= mission.rounds.length) {
      setMs((s) => ({ ...s, done: true }));
      setSay({ text: 'Three for three! You can read a key signature.', tone: 'win' });
      complete(mission);
      void fly('space', selected, false);
      return;
    }
    setMs((s) => ({ ...s, step: n, answered: false, hint: 0 }));
    setSay(null);
    player().stop();
  };

  const onTune = (deg: number): void => {
    if (mission?.kind !== 'tune' || ms.done) return;
    const k = keyOf(mission.key);
    const m = mission;
    const events = sequence([...phrasePitches(m.key, m.phrase), { pitch: degree(k, deg), beats: 2.5 }]);
    play(events, {
      onEnd: () => {
        if (isHomeDegree(deg)) {
          setMs((s) => ({ ...s, done: true }));
          setSay({ text: tuneHit(m.key), tone: 'win' });
          engineRef.current?.pulse(idx(m.key));
          complete(m);
        } else {
          setSay({ text: tuneMiss(deg), tone: 'try' });
          bumpHint();
        }
      },
    });
  };

  const onAgain = (): void => {
    if (!mission || ms.done) { playChord(viewKey); return; }
    if (mission.kind === 'tune') play(sequence(phrasePitches(mission.key, mission.phrase)));
    else if (mission.kind === 'fifth') play(sequence(fifthWalk(mission).slice(0, Math.max(1, ms.step)).map((p) => ({ pitch: p, beats: 0.8 }))));
    else if (mission.kind === 'match') { if (ms.answered) play(scaleEvents(viewKey), { scale: true }); }
    else playChord(viewKey);
  };

  // Engine callbacks read the latest closures through refs.
  const planetTapRef = useRef(onPlanetTap);
  planetTapRef.current = onPlanetTap;
  const keyDownRef = useRef(onPress);
  keyDownRef.current = onPress;

  // ---- what's on screen ----
  const hint = mission && !ms.done && !(mission.kind === 'match' && ms.answered) ? hintFor(mission, ms.hint, ms.step) : null;
  const next = nextMission(completed);
  const freeText = mode === 'planet'
    ? `Welcome to planet ${pcName(keyOf(selected).tonic)}! Play the piano, or tap “Hear the scale”.`
    : 'Tap a planet to fly there!';
  const instructionText = mission ? instruction(mission, ms.step) : freeText;
  const speech = say ?? { text: instructionText, tone: 'info' as Tone };
  const mood: CakeyMood = speech.tone === 'win' ? 'celebrate' : speech.tone === 'good' ? 'happy' : speech.tone === 'try' ? 'oops' : 'wave';
  const k = keyOf(viewKey);
  const focusLetter = hiding ? null : (mission?.kind === 'find' && !ms.done ? mission.target.letter : changedNotes(k)[0]?.letter ?? null);
  const focusPc = focusLetter ? (mission?.kind === 'find' ? pcOf(mission.target) : pcOf(changedNotes(k)[0])) : null;
  const tuneChoices = useMemo(
    () => (mission?.kind === 'tune' && !ms.done ? mission.phrase.choices.map((d) => midiOf(degree(keyOf(mission.key), d))) : []),
    [mission, ms.done],
  );
  const hintPcsKey = (hint?.pcs ?? []).join(',');

  // ---- feed the scene ----
  const ready = engineState === 'ready';
  useEffect(() => { engineRef.current?.setLooks(looks); }, [looks, ready]);
  useEffect(() => {
    engineRef.current?.setStaff({ keyId: viewKey, showScale: !hiding, mystery: hiding, focusLetter, hideNames: hideNames || hiding });
  }, [viewKey, hiding, focusLetter, hideNames, ready]);
  useEffect(() => {
    engineRef.current?.setPiano({
      keyId: viewKey,
      showScale: true,
      hideNames,
      choices: tuneChoices,
      hintPcs: hintPcsKey ? hintPcsKey.split(',').map(Number) : [],
      focusPc,
    });
  }, [viewKey, hideNames, tuneChoices, hintPcsKey, focusPc, ready]);
  useEffect(() => { engineRef.current?.setLit(lit, litScaleIdx); }, [lit, litScaleIdx, ready]);
  useEffect(() => { engineRef.current?.setLink(link ? [idx(link[0]), idx(link[1])] : null); }, [link, ready]);
  useEffect(() => { engineRef.current?.setReducedMotion(reduced); }, [reduced, ready]);
  // The strong match hint points at the planet.
  const matchHintKey = mission?.kind === 'match' && typeof hint?.choice === 'string' ? hint.choice : null;
  useEffect(() => {
    if (!matchHintKey) return;
    const i = idx(matchHintKey as KeyId);
    engineRef.current?.pulse(i);
    const timer = window.setInterval(() => engineRef.current?.pulse(i), 1600);
    return () => window.clearInterval(timer);
  }, [matchHintKey]);

  // The HUD tells the scene how much of the screen it covers.
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const measure = (): void => {
      const c = containerRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const isWide = r.width >= 760 && r.width >= r.height * 1.15;
      setWide(isWide);
      const head = headerRef.current?.getBoundingClientRect().bottom ?? r.top;
      const bub = bubbleRef.current?.getBoundingClientRect().bottom ?? head;
      const headPx = head - r.top;
      const bubPx = Math.max(headPx, bub - r.top);
      const e = engineRef.current;
      if (!e) return;
      if (mode === 'planet' && isWide) e.setInsets({ top: headPx + 4, bottom: 6, planetRow: bubPx - headPx });
      else e.setInsets({ top: bubPx + 6, bottom: 6, planetRow: 0 });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (bubbleRef.current) ro?.observe(bubbleRef.current);
    if (containerRef.current) ro?.observe(containerRef.current);
    return () => ro?.disconnect();
  }, [mode, ready, started]);

  // ---- the computer keyboard plays the piano ----
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const midi = QWERTY[e.key.toLowerCase()];
      if (midi === undefined || mode !== 'planet' || busy) return;
      e.preventDefault();
      engineRef.current?.flashKey(midi);
      keyDownRef.current(midi);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, mode, busy]);

  const setSetting = <K extends keyof MusicProgress['settings']>(key: K, v: MusicProgress['settings'][K]): void =>
    updateProgress((p) => ({ ...p, settings: { ...p.settings, [key]: v } }));

  const inMatch = mission?.kind === 'match' && !ms.done;

  return (
    <main className="relative h-[100dvh] w-full select-none overflow-hidden bg-[#140c33] text-zinc-900">
      <span ref={fontProbeRef} aria-hidden className="pointer-events-none absolute font-display opacity-0">.</span>
      <div ref={containerRef} className="absolute inset-0" />

      {/* ---- top bar ---- */}
      <header ref={headerRef} className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-2 sm:p-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChromeNavLink href={backHref} variant="dark" size="sm" ariaLabel="Exit Musical Planets">✕</ChromeNavLink>
          {mode === 'planet' ? (
            <ChromeNavButton variant="dark" size="sm" onClick={goToMap} disabled={busy} aria-label="Fly back up to see every planet">
              🪐<span className="hidden sm:inline"> All planets</span>
            </ChromeNavButton>
          ) : (
            <span className="truncate rounded-full bg-black/35 px-3 py-1.5 font-display text-sm font-bold text-white/95 sm:text-base">
              {MUSICAL_PLANETS_GLYPH} {kidName ? `${kidName}'s Musical Planets` : MUSICAL_PLANETS_NAME}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ChromeNavButton variant="dark" size="sm" onClick={() => setPanel((p) => (p === 'missions' ? null : 'missions'))} aria-expanded={panel === 'missions'}>
            ⭐ <span className="hidden sm:inline">Missions</span>
          </ChromeNavButton>
          <ChromeNavButton variant="dark" size="sm" onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))} aria-expanded={panel === 'settings'} aria-label="Settings">
            ⚙️
          </ChromeNavButton>
          <FeedbackButton gameSlug={gameSlug} kidName={kidName} compact />
          <SoundToggle size="sm" />
        </div>
      </header>

      {/* ---- Cakey and the mission ---- */}
      {started && ready ? (
        <div
          ref={bubbleRef}
          className={`absolute z-20 flex items-end gap-2 px-2 sm:px-3 ${wide ? 'left-0 max-w-[min(30rem,34vw)]' : 'inset-x-0'}`}
          style={{ top: headerRef.current ? headerRef.current.offsetHeight : 56 }}
          role="status"
          aria-live="polite"
        >
          <GamecakesMascot size={wide ? 64 : 52} mood={mood} />
          <div
            key={speech.text}
            className="relative flex-1 rounded-2xl border border-amber-200 bg-amber-50/95 px-3 py-2.5 shadow-lg sm:px-4 sm:py-3"
            style={{ animation: reduced ? undefined : 'mp-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <p className="font-display text-base font-bold leading-snug sm:text-lg">
              {speech.tone === 'win' ? <span aria-hidden>✨ </span> : null}
              {speech.text}
            </p>
            {hint ? (
              <p className="mt-1 font-body text-sm font-semibold text-violet-800 sm:text-base">
                <span aria-hidden>💡 </span>{hint.text}
              </p>
            ) : null}
            {busy ? null : <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {inMatch && ms.answered ? (
                <CandyButton role="act" size="md" shape="pill" onClick={onMatchNext}>
                  {ms.step + 1 >= (mission?.kind === 'match' ? mission.rounds.length : 0) ? 'Finish ✓' : 'Next sign ▶'}
                </CandyButton>
              ) : null}
              {mode === 'planet' && !hiding ? (
                <CandyButton role="grow" size="sm" shape="pill" onClick={onHearScale} disabled={busy}>
                  🎹 Hear the scale
                </CandyButton>
              ) : null}
              {mode === 'planet' || (inMatch && ms.answered) ? (
                <ChromeNavButton variant="dark" size="sm" onClick={onAgain} disabled={busy}>
                  🔁 {mission?.kind === 'tune' && !ms.done ? 'Play the tune' : 'Again'}
                </ChromeNavButton>
              ) : null}
              {mission && !ms.done && !(mission.kind === 'match' && ms.answered) ? (
                <ChromeNavButton variant="dark" size="sm" onClick={bumpHint} disabled={ms.hint >= MAX_HINT}>
                  💡 Hint
                </ChromeNavButton>
              ) : null}
              {ms.done && mission ? (
                next ? (
                  <CandyButton role="act" size="sm" shape="pill" onClick={() => startMission(next)} disabled={busy}>
                    Next: {next.title} ▶
                  </CandyButton>
                ) : (
                  <span className="font-display text-sm font-bold text-emerald-800">🎉 Every mission done! Fly to any planet.</span>
                )
              ) : null}
              {!mission && next && mode === 'space' ? (
                <CandyButton role="act" size="sm" shape="pill" onClick={() => startMission(next)} disabled={busy}>
                  Next mission: {next.title} ▶
                </CandyButton>
              ) : null}
            </div>}
            <span aria-hidden className="absolute -left-1.5 bottom-4 h-3 w-3 rotate-45 border-b border-l border-amber-200 bg-amber-50" />
          </div>
        </div>
      ) : null}

      {/* What is sounding, for anyone who cannot hear it. */}
      <p aria-live="polite" className="pointer-events-none absolute bottom-1 right-2 z-20 font-mono text-xs font-bold text-white/70">
        {lit.length > 0 ? `♪ ${caption}` : ''}
      </p>

      {/* Planets as buttons for keyboard and screen-reader users. */}
      {started && ready && mode === 'space' ? (
        <nav aria-label="Planets" className="sr-only">
          {CIRCLE.map((id, i) => (
            <button key={id} type="button" onClick={() => onPlanetTap(i)}>
              {keyName(keyOf(id))}, {signatureWords(keyOf(id))}
              {looks[i].status === 'locked' ? ', locked' : looks[i].status === 'future' ? ', a planet for later' : ''}
            </button>
          ))}
        </nav>
      ) : null}

      {/* ---- missions + settings ---- */}
      {panel ? (
        <div className="absolute inset-x-2 top-16 z-40 mx-auto max-w-xl rounded-3xl border-4 border-white/70 bg-gradient-to-br from-violet-50 via-amber-50 to-emerald-50 p-4 shadow-2xl sm:top-20">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">{panel === 'missions' ? '⭐ Missions' : '⚙️ Settings'}</h2>
            <ChromeNavButton variant="dark" size="sm" onClick={() => setPanel(null)} aria-label="Close">✕</ChromeNavButton>
          </div>
          {panel === 'missions' ? (
            <div className="flex flex-wrap gap-2">
              {MISSIONS.map((m) => {
                const open = isMissionOpen(m, completed);
                const done = completed.includes(m.id);
                const active = mission?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!open || busy}
                    onClick={() => startMission(m)}
                    aria-current={active ? 'step' : undefined}
                    className={`chrome-focus min-h-[48px] rounded-full border-2 px-3.5 py-2 font-display text-base font-bold transition-[transform,background-color] duration-100 active:scale-95 ${
                      active
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : done
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : open
                            ? 'border-violet-200 bg-white text-zinc-900'
                            : 'border-zinc-200 bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    <span aria-hidden>{done ? '✓' : open ? m.glyph : '🔒'} </span>
                    {m.title}
                    {!open ? <span className="sr-only"> (after the C major missions)</span> : null}
                    {done ? <span className="sr-only"> (done)</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-base font-semibold text-zinc-800">
              <label className="flex items-center gap-3">
                🔊 Volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={progress.settings.volume}
                  onChange={(e) => setSetting('volume', Number(e.target.value))}
                  className="h-11 w-40 accent-rose-600"
                />
              </label>
              <label className="flex min-h-[44px] items-center gap-2">
                <input type="checkbox" className="h-6 w-6 accent-rose-600" checked={hideNames} onChange={(e) => setSetting('hideLabels', e.target.checked)} />
                Challenge: hide note names
              </label>
              <label className="flex min-h-[44px] items-center gap-2">
                <input type="checkbox" className="h-6 w-6 accent-rose-600" checked={progress.settings.calm} onChange={(e) => setSetting('calm', e.target.checked)} />
                Calm motion
              </label>
              <p className="text-sm font-medium text-zinc-600">On a computer, the keys A W S E D F T G Y H U J K play the piano.</p>
              <div>
                <ChromeNavButton
                  variant="dark"
                  size="sm"
                  onClick={() => {
                    updateProgress((p) => ({ ...p, completed: [] }));
                    setSelected('C');
                    startMission(MISSIONS[0]);
                  }}
                >
                  Start over
                </ChromeNavButton>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ---- loading / no 3D ---- */}
      {engineState === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
          <GamecakesMascot mood="happy" size={104} className="drop-shadow-lg" />
          <p className="font-display text-base font-semibold text-white/90">Fueling Cakey’s rocket…</p>
        </div>
      ) : null}
      {engineState === 'failed' ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-[2rem] bg-white p-8 text-center shadow-2xl">
            <GamecakesMascot mood="oops" size={96} />
            <h2 className="font-display text-2xl font-bold">The planets need 3D</h2>
            <p className="text-base font-semibold text-zinc-700">
              This device has 3D graphics turned off, so Musical Planets can’t fly here. Try another device, or ask a grown-up to turn on WebGL.
            </p>
            <ChromeNavLink href={backHref} variant="dark" size="md">← Back</ChromeNavLink>
          </div>
        </div>
      ) : null}

      {/* ---- start: audio may only begin after a tap ---- */}
      {!started && engineState !== 'failed' ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-violet-950/30 p-4" role="dialog" aria-modal="true" aria-labelledby="mp-start-title">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[2rem] border-4 border-white/70 bg-gradient-to-br from-violet-100 via-amber-50 to-emerald-100 p-8 text-center shadow-2xl">
            <div className="text-7xl" aria-hidden>{MUSICAL_PLANETS_GLYPH}</div>
            <h2 id="mp-start-title" className="font-display text-4xl font-bold">{MUSICAL_PLANETS_NAME}</h2>
            <p className="text-lg font-semibold text-zinc-700">
              Twelve music planets. Each one is a key. Fly Cakey’s rocket to them, hear them, and play them on the piano.
            </p>
            <CandyButton role="act" size="lg" shape="pill" onClick={begin} autoFocus disabled={!ready}>
              {!ready ? 'Getting ready…' : completed.length > 0 ? '🚀 Keep going' : '🚀 Start'}
            </CandyButton>
            <p className="text-sm text-zinc-600">Sound on! The music starts when you tap.</p>
          </div>
        </div>
      ) : null}

      <style>{`@keyframes mp-pop {0%{transform:scale(0.94);opacity:0.4;}100%{transform:scale(1);opacity:1;}}`}</style>
    </main>
  );
}
