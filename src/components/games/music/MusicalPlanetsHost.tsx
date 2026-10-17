'use client';

// Musical Planets — the circle, the staff and the piano, kept in step.
//
// One selected key drives all three views: the planet that glows, the
// signature on the staff, the dots on the piano and what the synth plays. The
// only time they are allowed to differ is "match the signature", where the
// staff shows a mystery key until the kid names it; then the planet, the
// piano and the scale all land on the answer together.
//
// Missions, hints and words come from lib/games/music/missions.ts; musical
// facts from theory.ts; this file only decides what is on screen. Progress is
// kept on the device (progress.ts) and never posted: no account needed, no
// attempts row, no tokens.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import SoundToggle from '@/components/SoundToggle';
import GamecakesLogo from '@/components/GamecakesLogo';
import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useGameBackTarget } from '@/lib/games/use-game-back-target';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import Staff from './Staff';
import Piano from './Piano';
import PlanetCircle, { type PlanetStatus } from './PlanetCircle';
import {
  CIRCLE,
  changedNotes,
  degree,
  keyName,
  keyOf,
  majorScale,
  pcName,
  pcOf,
  pianoKeys,
  signatureMarks,
  signatureWords,
  spellInKey,
  staffStep,
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
import { MusicPlayer, chord, sequence, takeLength, type PlayEvent } from '@/lib/games/music/synth';
import { MUSICAL_PLANETS_GLYPH, MUSICAL_PLANETS_NAME } from '@/lib/games/music/name';

export interface MusicalPlanetsHostProps {
  gameSlug: string;
  kidName?: string;
  /** Passed by the guest arcade; unused (the name is a constant). */
  title?: string;
}

type Tone = 'info' | 'good' | 'try' | 'win';

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

/** "The ♯ on the top line makes every F an F♯." */
function signatureMeaning(id: KeyId): string {
  const k = keyOf(id);
  const marks = signatureMarks(k);
  if (marks.length === 0) return 'No sharps or flats: every note is a white key.';
  const mk = marks[0];
  const step = staffStep(mk.pitch);
  const where = step === 8 ? 'top line' : step === 4 ? 'middle line' : step % 2 === 0 ? 'line' : 'space';
  const pc = { letter: mk.pitch.letter, acc: mk.acc } as PitchClass;
  return `The ${mk.acc === 1 ? '♯' : '♭'} on the ${where} makes every ${mk.pitch.letter} a ${pcName(pc)}, high or low.`;
}

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
  const backLabel = back?.label ?? '← All Games';

  const [progress, setProgress] = useState<MusicProgress>(DEFAULT_PROGRESS);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<KeyId>('C');
  const [mission, setMission] = useState<Mission | null>(null);
  const [ms, setMs] = useState<MissionState>(FRESH);
  const [say, setSay] = useState<{ text: string; tone: Tone } | null>(null);
  const [lit, setLit] = useState<ReadonlySet<number>>(new Set());
  const [litScaleIdx, setLitScaleIdx] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [link, setLink] = useState<readonly [KeyId, KeyId] | null>(null);
  const [pulse, setPulse] = useState<{ key: KeyId; n: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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

  const status = useMemo(() => {
    const s = {} as Record<KeyId, PlanetStatus>;
    for (const id of CIRCLE) {
      s[id] = unlocked.includes(id) ? 'open' : LESSON_KEYS.includes(id) ? 'locked' : 'future';
    }
    return s;
  }, [unlocked]);

  // ---- playback: every take lights the keys and captions what sounds ----
  const play = useCallback((events: PlayEvent[], opts: { scale?: boolean; onEnd?: () => void } = {}) => {
    setLit(new Set());
    setLitScaleIdx(null);
    player().play(events, {
      onEvent: (ev, i) => {
        setLit(new Set(ev.midis));
        setCaption(ev.label);
        if (opts.scale) setLitScaleIdx(i);
      },
      onEnd: () => {
        setLit(new Set());
        setLitScaleIdx(null);
        opts.onEnd?.();
      },
    });
  }, []);

  const playChord = useCallback((id: KeyId) => play(chord(tonicTriad(keyOf(id)))), [play]);
  const scaleEvents = (id: KeyId): PlayEvent[] => sequence(majorScale(keyOf(id)).map((pitch, i) => ({ pitch, beats: i === 7 ? 2 : 1 })));

  // ---- missions ----
  const bounce = (key: KeyId): void => setPulse((p) => ({ key, n: (p?.n ?? 0) + 1 }));

  const complete = useCallback((m: Mission) => {
    hapticSuccess();
    updateProgress((p) => {
      if (p.completed.includes(m.id)) return p;
      const done = [...p.completed, m.id];
      if (!introDone(p.completed) && introDone(done)) {
        // The C introduction just finished: open G and F where the kid can see it.
        window.setTimeout(() => { bounce('G'); window.setTimeout(() => bounce('F'), 450); }, 900);
      }
      return { ...p, completed: done };
    });
  }, [updateProgress]);

  const startMission = useCallback((m: Mission) => {
    setMission(m);
    setMs(FRESH);
    setSay(null);
    setLink(null);
    player().stop();
    if (m.kind === 'match') return;
    setSelected(m.key);
    if (m.kind === 'tune') play(sequence(phrasePitches(m.key, m.phrase)));
    else playChord(m.key);
  }, [play, playChord]);

  const begin = (): void => {
    player().unlock();
    setStarted(true);
    startMission(nextMission(completed) ?? MISSIONS[0]);
  };

  const bumpHint = (): void => setMs((s) => ({ ...s, hint: Math.min(MAX_HINT, s.hint + 1) }));

  // The key the staff and piano show. Only "match" may hide the real one.
  const mysteryKey = mission?.kind === 'match' && !ms.done ? mission.rounds[ms.step % mission.rounds.length] : null;
  const viewKey: KeyId = mysteryKey && !ms.answered ? mysteryKey : selected;
  const hiding = mysteryKey !== null && !ms.answered;

  // ---- the circle ----
  const onSelectPlanet = (id: KeyId): void => {
    hapticTap();
    if (status[id] === 'locked') {
      setSay({ text: `${keyName(keyOf(id))} opens after the C major missions. Almost there!`, tone: 'info' });
      return;
    }
    if (status[id] === 'future') {
      setSay({ text: `${keyName(keyOf(id))} is a planet for later. It has ${signatureWords(keyOf(id))}.`, tone: 'info' });
      return;
    }
    if (hiding) {
      setSay({ text: 'Use the big buttons to answer — which planet is the mystery sign from?', tone: 'info' });
      return;
    }
    setSelected(id);
    setLink(null);
    playChord(id);
  };

  // ---- the piano ----
  const onPress = (midi: number): void => {
    const key = keyOf(hiding ? 'C' : viewKey);
    const raw = KEYS.find((k) => k.midi === midi)!.natural;
    const spelled = spellInKey(key, midi);
    // C, G and F never respell across an octave (no B♯ or C♭), so the piano
    // key's own octave is the note's.
    const pitch = spelled ? { ...spelled, octave: raw.octave } : raw;
    const tapped: PitchClass = spelled ?? raw;

    if (!mission || ms.done) { play(sequence([{ pitch, beats: 1.6 }])); return; }

    if (mission.kind === 'find') {
      play(sequence([{ pitch, beats: 1.6 }]));
      if (pcOf(tapped) === pcOf(mission.target)) {
        setSay({ text: findHit(mission), tone: 'win' });
        setMs((s) => ({ ...s, done: true }));
        bounce(mission.key);
        complete(mission);
      } else {
        setSay({ text: findMiss(mission, tapped), tone: 'try' });
        bumpHint();
      }
      return;
    }

    if (mission.kind === 'fifth') {
      const walk = fifthWalk(mission);
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
      // Five! Play the whole walk, then the new planet's chord.
      const to = mission.to;
      const walkEv = sequence(walk.map((p) => ({ pitch: p, beats: 0.8 })));
      const toChord = chord(tonicTriad(keyOf(to))).map((e) => ({ ...e, at: e.at + takeLength(walkEv) + 0.2 }));
      play([...walkEv, ...toChord]);
      setMs((s) => ({ ...s, step: n, done: true }));
      setSelected(to);
      setLink([mission.key, to]);
      bounce(to);
      setSay({ text: fifthDone(mission), tone: 'win' });
      complete(mission);
      return;
    }

    play(sequence([{ pitch, beats: 1.6 }]));
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
          bounce(id);
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
      bounce(pick);
      hapticSuccess();
      play(scaleEvents(pick), { scale: true });
    } else {
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
          bounce(m.key);
          complete(m);
        } else {
          setSay({ text: tuneMiss(deg), tone: 'try' });
          bumpHint();
        }
      },
    });
  };

  const onAgain = (): void => {
    if (!mission) { playChord(viewKey); return; }
    if (mission.kind === 'tune') play(sequence(phrasePitches(mission.key, mission.phrase)));
    else if (mission.kind === 'fifth') play(sequence(fifthWalk(mission).slice(0, Math.max(1, ms.step)).map((p) => ({ pitch: p, beats: 0.8 }))));
    else playChord(viewKey);
  };

  const hint = mission && !ms.done && !(mission.kind === 'match' && ms.answered) ? hintFor(mission, ms.hint, ms.step) : null;
  const next = nextMission(completed);
  const instructionText = mission ? instruction(mission, ms.step) : `Tap a planet to hear it. Tap the piano to play.`;
  const speech = say ?? { text: instructionText, tone: 'info' as Tone };
  const mood: CakeyMood = speech.tone === 'win' ? 'celebrate' : speech.tone === 'good' ? 'happy' : speech.tone === 'try' ? 'oops' : 'wave';
  const k = keyOf(viewKey);
  const focusLetter = hiding ? null : (mission?.kind === 'find' ? mission.target.letter : changedNotes(k)[0]?.letter ?? null);
  const pianoHint = hint?.pcs ?? [];

  const setSetting = <K extends keyof MusicProgress['settings']>(key: K, v: MusicProgress['settings'][K]): void =>
    updateProgress((p) => ({ ...p, settings: { ...p.settings, [key]: v } }));

  const title = `${MUSICAL_PLANETS_GLYPH} ${MUSICAL_PLANETS_NAME}`;

  return (
    <main
      className="flex flex-1 flex-col items-center gap-3 p-3 sm:p-5"
      style={{ background: 'linear-gradient(180deg, #f5f3ff 0%, #fff7ed 60%, #fdf2f8 100%)' }}
    >
      <header className="flex w-full max-w-6xl items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={40} />
          <div>
            <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">{title}</div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
              {kidName ? `${kidName}'s Musical Planets` : 'Musical Planets'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FeedbackButton gameSlug={gameSlug} kidName={kidName} />
          <SoundToggle size="sm" />
          <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
        </div>
      </header>

      <div className="grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ---- the map ---- */}
        <section aria-label="Circle of fifths" className="mx-auto w-full" style={{ maxWidth: 'min(100%, 38vh, 520px)' }}>
          <PlanetCircle
            selected={selected}
            status={status}
            link={link}
            pulse={pulse}
            reducedMotion={reduced}
            onSelect={onSelectPlanet}
          />
          <p className="mt-2 text-center font-display text-sm font-bold text-zinc-700">
            <span aria-hidden>↻ </span>Clockwise: one more ♯
            <span className="mx-2 text-zinc-400" aria-hidden>·</span>
            <span aria-hidden>↺ </span>Counterclockwise: one more ♭
          </p>
        </section>

        {/* ---- Cakey, the mission, the staff ---- */}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-end gap-2" role="status" aria-live="polite">
            <GamecakesMascot size={64} mood={mood} />
            <div
              key={speech.text}
              className="relative flex-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-display text-lg font-bold leading-snug text-zinc-900 shadow-md sm:text-xl"
              style={{ animation: reduced ? undefined : 'mp-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
              {speech.tone === 'win' ? <span aria-hidden>✨ </span> : null}
              {speech.text}
              {hint ? (
                <span className="mt-1.5 block font-body text-base font-semibold text-violet-800">
                  <span aria-hidden>💡 </span>{hint.text}
                </span>
              ) : null}
              <span aria-hidden className="absolute -left-1.5 bottom-4 h-3 w-3 rotate-45 border-b border-l border-amber-200 bg-amber-50" />
            </div>
          </div>

          {/* mission controls */}
          <div className="flex flex-wrap items-center gap-2">
            {mission?.kind === 'match' && !ms.done ? (
              ms.answered ? (
                <CandyButton role="act" size="lg" shape="pill" onClick={onMatchNext}>
                  {ms.step + 1 >= mission.rounds.length ? 'Finish ✓' : 'Next sign ▶'}
                </CandyButton>
              ) : (
                (['C', 'G', 'F'] as KeyId[]).map((id) => (
                  <CandyButton
                    key={id}
                    role="travel"
                    size="lg"
                    shape="pill"
                    onClick={() => onMatch(id)}
                    className={hint?.choice === id ? 'ring-4 ring-amber-400 ring-offset-2' : ''}
                    aria-label={`${keyName(keyOf(id))}${hint?.choice === id ? ' (hint)' : ''}`}
                  >
                    🪐 {id} major{hint?.choice === id ? ' 👈' : ''}
                  </CandyButton>
                ))
              )
            ) : null}

            {mission?.kind === 'tune' && !ms.done
              ? mission.phrase.choices.map((deg) => {
                  const p = degree(keyOf(mission.key), deg);
                  const glow = hint?.choice === deg;
                  return (
                    <CandyButton
                      key={deg}
                      role="earn"
                      size="lg"
                      shape="pill"
                      onClick={() => onTune(deg)}
                      className={glow ? 'ring-4 ring-amber-400 ring-offset-2' : ''}
                      aria-label={`End on ${pcName(p)}${glow ? ' (hint)' : ''}`}
                    >
                      🎵 {pcName(p)}{glow ? ' 👈' : ''}
                    </CandyButton>
                  );
                })
              : null}

            {!hiding ? (
              <CandyButton role="grow" size="md" shape="pill" onClick={onHearScale}>
                🎹 Hear the scale
              </CandyButton>
            ) : null}
            <ChromeNavButton variant="dark" size="md" onClick={onAgain}>
              🔁 {mission?.kind === 'tune' ? 'Play the tune' : 'Hear it again'}
            </ChromeNavButton>
            {mission && !ms.done && !(mission.kind === 'match' && ms.answered) ? (
              <ChromeNavButton variant="dark" size="md" onClick={bumpHint} disabled={ms.hint >= MAX_HINT}>
                💡 Hint
              </ChromeNavButton>
            ) : null}
            {ms.done ? (
              next ? (
                <CandyButton role="act" size="md" shape="pill" onClick={() => startMission(next)}>
                  Next: {next.title} ▶
                </CandyButton>
              ) : (
                <span className="font-display text-base font-bold text-emerald-800">🎉 Every mission done! Play any planet.</span>
              )
            ) : null}
            {ms.done && mission ? (
              <ChromeNavButton variant="dark" size="md" onClick={() => startMission(mission)}>
                ↺ Do it again
              </ChromeNavButton>
            ) : null}
          </div>

          {/* the staff */}
          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-zinc-900">
                {hiding ? '🔍 Mystery key signature' : `${keyName(k)} · ${signatureWords(k)}`}
              </h2>
              {!hiding ? <span className="font-mono text-xs text-zinc-500">home note: {pcName(k.tonic)}</span> : null}
            </div>
            <Staff
              keyId={viewKey}
              showScale={!hiding}
              focusLetter={focusLetter}
              litIndex={litScaleIdx}
              hideNames={hideNames}
              revealKey={!hiding}
            />
            {!hiding ? <p className="mt-1 text-base font-semibold text-zinc-700">{signatureMeaning(viewKey)}</p> : null}
          </div>
        </section>
      </div>

      {/* ---- the piano ----
          While a signature is a mystery the piano spells in C, so a black key
          reads "F♯ / G♭" instead of naming the answer. */}
      <section aria-label="Piano" className="w-full max-w-6xl rounded-2xl border border-violet-100 bg-white/90 p-3 shadow-sm">
        <div className="mb-2 flex min-h-[28px] flex-wrap items-center justify-between gap-2">
          <span className="font-display text-sm font-bold text-zinc-600">
            <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-500 align-middle" />
            dot = in {hiding ? 'the key' : keyName(k)}
          </span>
          <span aria-live="polite" className="font-mono text-sm font-bold text-emerald-800">
            {lit.size > 0 ? `♪ ${caption}` : ''}
          </span>
        </div>
        <Piano keyId={hiding ? 'C' : viewKey} lit={lit} hintPcs={pianoHint} showScale={!hiding} hideNames={hideNames} onPress={onPress} />
      </section>

      {/* ---- missions + settings ---- */}
      <section aria-label="Missions" className="w-full max-w-6xl">
        <div className="flex flex-wrap gap-2">
          {MISSIONS.map((m) => {
            const open = isMissionOpen(m, completed);
            const done = completed.includes(m.id);
            const active = mission?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={!open}
                onClick={() => startMission(m)}
                aria-current={active ? 'step' : undefined}
                className={`chrome-focus min-h-[44px] rounded-full border-2 px-3.5 py-2 font-display text-sm font-bold transition-[transform,background-color] duration-100 active:scale-95 ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : done
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : open
                        ? 'border-violet-200 bg-white text-zinc-900'
                        : 'border-zinc-200 bg-zinc-100 text-zinc-600'
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ChromeNavButton variant="dark" size="sm" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            ⚙️ Settings
          </ChromeNavButton>
          <ChromeNavLink href={backHref} variant="dark" size="sm">{backLabel}</ChromeNavLink>
        </div>
        {showSettings ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-zinc-200 bg-white p-4 text-base font-semibold text-zinc-800">
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
        ) : null}
      </section>

      {/* ---- start: audio may only begin after a tap ---- */}
      {!started ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-violet-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mp-start-title">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[2rem] border-4 border-white/70 bg-gradient-to-br from-violet-100 via-amber-50 to-emerald-100 p-8 text-center shadow-2xl">
            <div className="text-7xl" aria-hidden>{MUSICAL_PLANETS_GLYPH}</div>
            <h2 id="mp-start-title" className="font-display text-4xl font-bold text-zinc-900">{MUSICAL_PLANETS_NAME}</h2>
            <p className="text-lg font-semibold text-zinc-700">
              Twelve music planets. Each one is a key. Visit them, hear them, and play them on the piano.
            </p>
            <CandyButton role="act" size="lg" shape="pill" onClick={begin} autoFocus>
              {completed.length > 0 ? '🎹 Keep going' : '🎹 Start'}
            </CandyButton>
            <p className="text-sm text-zinc-600">Sound on! The music starts when you tap.</p>
          </div>
        </div>
      ) : null}

      <style>{`@keyframes mp-pop {0%{transform:scale(0.94);opacity:0.4;}100%{transform:scale(1);opacity:1;}}`}</style>
    </main>
  );
}

