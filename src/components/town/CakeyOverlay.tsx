'use client';

// CakeyOverlay — the DOM layer for the wandering town mascot.
//
// Two parts, both above the 3D canvas:
//   1. A FOLLOW BUBBLE that tracks Cakey's projected screen position (fed by the
//      engine's throttled onCakeyMove report, read here via a ref + rAF so the
//      bubble tracks every frame WITHOUT re-rendering React — same trick the
//      Minimap uses). It shows short ambient persona lines while he roams.
//   2. A TAP PANEL (opened when the kid taps Cakey) with three things to do:
//      Quick trivia (reuses pickQuestion), What's new from the Story Oven
//      (reuses WHATS_NEW), and Just saying hi. Its full-screen backdrop also
//      swallows canvas taps, so the kid can't walk while Cakey is talking.
//
// The panel's OPEN state is owned by the host (flipped in the engine's onCakeyTap
// callback); the panel is mounted only while open, so its inner mode always
// starts fresh at the menu. All of Cakey's WORDS live in @/lib/town/cakey-lines;
// the engine only ever tells us WHERE he is and WHEN he's tapped.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { pickQuestion, type TriviaQuestion } from '@/lib/trivia/questions';
import { WHATS_NEW } from '@/lib/whats-new';
import {
  AMBIENT_LINES,
  HELLO_LINES,
  SOCKS_AND_SHOES_LINES,
  NOTICE_PLAYER_LINES,
  TRIVIA_INTRO_LINES,
  WEATHER_LINES,
  greeting,
  pickJoke,
  pickLine,
  whatsNewToCakeyLines,
  type DadJoke,
} from '@/lib/town/cakey-lines';
import type { CakeyMoveInfo } from '@/lib/town/three/engine';
import type { WeatherKind } from '@/lib/town/weather-config';
import { STORY_EVENTS } from '@/lib/town/story-events';
import { speak as speakLine, stopSpeaking } from '@/lib/town/cakey-voice';
import SpokenText from '@/components/town/SpokenText';
import CakeyLightningQuiz from '@/components/town/CakeyLightningQuiz';

interface CakeyOverlayProps {
  displayName?: string;
  /** Kid's grade for trivia calibration (0=K…6), or null to use the default. */
  kidGrade: number | null;
  /** Latest engine report of Cakey's screen anchor. Updated ~11×/sec on a ref
   *  (not state) so the follow loop never re-renders the tree. */
  infoRef: MutableRefObject<CakeyMoveInfo | null>;
  /** Whether the talk panel is open (host flips this on tap). */
  open: boolean;
  /** Close the talk panel. */
  onClose: () => void;
  /** Called with true while the panel is open so the engine freezes his wander
   *  and turns him to face the kid. */
  onPauseChange: (paused: boolean) => void;
  /** Current sky state — a change (other than the calm default) makes Cakey
   *  drop a weather line. */
  weatherKind: WeatherKind;
  /** Replay a story's mini narrative by slug (the panel's "Watch a Story again"
   *  list). The host closes the panel and starts the cutscene. */
  onPlayStory?: (slug: string) => void;
  /** Open the Cakey Garage from Cakey himself. Renting used to require standing
   *  at the garage in Town Square; Cakey wanders the whole island, so this lets
   *  a kid who is stranded far from the square still get wheels — which matters
   *  a great deal now that Race Island cannot be reached on foot. */
  onOpenGarage?: () => void;
}

export default function CakeyOverlay({
  displayName,
  kidGrade,
  infoRef,
  open,
  onClose,
  onPauseChange,
  weatherKind,
  onPlayStory,
  onOpenGarage,
}: CakeyOverlayProps): React.ReactElement {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [ambientLine, setAmbientLine] = useState<string | null>(null);
  const ambientIdxRef = useRef(-1);

  // Position the bubble over the canvas each frame from the engine's ref.
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const el = bubbleRef.current;
      if (!el) return;
      const info = infoRef.current;
      // Hide when there's nothing to say, Cakey's off-screen, or the panel is
      // up (the panel carries the conversation then).
      if (!info || !info.onScreen || !ambientLine || open) {
        el.style.opacity = '0';
        return;
      }
      el.style.left = `${info.xPct * 100}%`;
      el.style.top = `${info.yPct * 100}%`;
      el.style.opacity = '1';
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [infoRef, ambientLine, open]);

  // Drop an ambient line every so often while roaming (never over the panel).
  // Picks a "notice you" line when he's close, otherwise a stroll one-liner.
  useEffect(() => {
    const speak = (): void => {
      if (open) return;
      const info = infoRef.current;
      if (!info || !info.onScreen) return;
      // Socks come up about one wander-line in five: often enough to land as a
      // running bit, rare enough that nobody starts tuning him out. A nag heard
      // every time is a nag nobody hears.
      const pool =
        Math.random() < 0.2
          ? SOCKS_AND_SHOES_LINES
          : info.nearPlayer && Math.random() < 0.6
            ? NOTICE_PLAYER_LINES
            : AMBIENT_LINES;
      const { line, index } = pickLine(pool, ambientIdxRef.current);
      ambientIdxRef.current = index;
      setAmbientLine(line);
      window.setTimeout(() => setAmbientLine((cur) => (cur === line ? null : cur)), 5200);
    };
    const first = window.setTimeout(speak, 3500); // a beat after entering
    const interval = window.setInterval(speak, 15000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [infoRef, open]);

  // Weather turned — Cakey remarks on it (skips the calm 'sunny' default so he
  // isn't chatty about clear skies). Scheduled via a timer so setState never
  // runs synchronously inside the effect body.
  useEffect(() => {
    if (weatherKind === 'sunny') return;
    const t = window.setTimeout(() => {
      const { line } = pickLine(WEATHER_LINES[weatherKind]);
      setAmbientLine(line);
      window.setTimeout(() => setAmbientLine((cur) => (cur === line ? null : cur)), 5600);
    }, 0);
    return () => window.clearTimeout(t);
  }, [weatherKind]);

  // Freeze/unfreeze his wander whenever ANY bubble is up — the tap panel OR a
  // roaming one-liner. Without the ambient half he'd "talk while power-walking
  // away"; pausing makes him stop, turn to the kid, and deliver the line, then
  // resume once it fades (~5s). External-system sync, so calling the callback
  // in the effect body is correct (no setState here).
  useEffect(() => {
    onPauseChange(open || ambientLine != null);
  }, [open, ambientLine, onPauseChange]);

  return (
    <>
      {/* Follow bubble — pinned over the canvas, offset up-left of Cakey. */}
      <div
        ref={bubbleRef}
        aria-live="polite"
        className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full opacity-0 transition-opacity duration-200"
        style={{ left: '50%', top: '50%' }}
      >
        {ambientLine ? (
          <div className="animate-cakey-pop relative max-w-[220px] rounded-[1.4rem] border-2 border-rose-200/80 bg-white/95 px-4 py-2.5 font-display text-sm font-semibold leading-snug text-zinc-800 shadow-lg shadow-rose-500/15 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-100">
            <SpokenText text={ambientLine} />
            {/* Rounded speech tail: a small square rotated 45° so its bottom
                corner points down toward Cakey; border only on the two
                down-facing edges, bg matches the card to hide the seam. */}
            <span
              className="absolute -bottom-[7px] left-6 h-3.5 w-3.5 rotate-45 rounded-[3px] border-b-2 border-r-2 border-rose-200/80 bg-white/95 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/95"
              aria-hidden
            />
          </div>
        ) : null}
      </div>

      {/* Tap panel — mounted only while open (so its inner mode starts at the
          menu); its full-screen backdrop swallows canvas taps. */}
      {open ? (
        <CakeyPanel
          onClose={onClose}
          displayName={displayName}
          kidGrade={kidGrade}
          onPlayStory={onPlayStory}
          onOpenGarage={onOpenGarage}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The talk panel: menu → trivia / what's new / hi.
// ---------------------------------------------------------------------------

type PanelMode = 'menu' | 'trivia' | 'quiz' | 'whatsnew' | 'hi' | 'joke' | 'story';
type TriviaPhase = 'asking' | 'correct' | 'wrong';

function CakeyPanel({
  onClose,
  displayName,
  kidGrade,
  onPlayStory,
  onOpenGarage,
}: {
  onClose: () => void;
  displayName?: string;
  kidGrade: number | null;
  onPlayStory?: (slug: string) => void;
  /** Open the Cakey Garage from Cakey himself. Renting used to require standing
   *  at the garage in Town Square; Cakey wanders the whole island, so this lets
   *  a kid who is stranded far from the square still get wheels — which matters
   *  a great deal now that Race Island cannot be reached on foot. */
  onOpenGarage?: () => void;
}): React.ReactElement {
  const [mode, setMode] = useState<PanelMode>('menu');

  // Keyboard dismiss to match the backdrop tap / "Bye, Cakey".
  useEscapeKey(onClose);

  // Cut the audio when the panel goes away — otherwise a punchline keeps playing
  // to a closed panel, which reads as the game talking to itself.
  useEffect(() => () => stopSpeaking(), []);

  // Trivia state (mirrors CakeyGreeting's phase machine).
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const [lastIndex, setLastIndex] = useState(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<TriviaPhase>('asking');
  const [introLine, setIntroLine] = useState('');

  // What's-New state — step through one entry's Cakey-voiced lines at a time.
  const [entryIdx, setEntryIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const newsLines =
    WHATS_NEW.length > 0
      ? whatsNewToCakeyLines(WHATS_NEW[entryIdx % WHATS_NEW.length], displayName)
      : [];

  const [helloLine] = useState(() => greeting(displayName));

  // Dad-joke state — hold the current joke, avoid repeating the last one, and
  // gate the punchline behind a tap so the reveal lands.
  const [joke, setJoke] = useState<DadJoke | null>(null);
  const [jokeLastIdx, setJokeLastIdx] = useState(-1);
  const [jokeRevealed, setJokeRevealed] = useState(false);

  // Voice fires on TAP-DRIVEN lines only. The ambient/weather one-liners run on
  // a 15s timer with no user gesture: iOS blocks audio without one, and a mascot
  // muttering every fifteen seconds would wear thin fast. He speaks when spoken
  // to.
  const startJoke = useCallback(() => {
    const { joke: j, index } = pickJoke(jokeLastIdx);
    setJoke(j);
    setJokeLastIdx(index);
    setJokeRevealed(false);
    speakLine(j.setup);
    setMode('joke');
  }, [jokeLastIdx]);

  const startTrivia = useCallback(() => {
    const { question: q, index } = pickQuestion(kidGrade, lastIndex);
    setQuestion(q);
    setLastIndex(index);
    setSelected(null);
    setPhase('asking');
    const intro = pickLine(TRIVIA_INTRO_LINES).line;
    setIntroLine(intro);
    speakLine(intro);
    setMode('trivia');
  }, [kidGrade, lastIndex]);

  const choose = (i: number): void => {
    if (selected !== null || !question) return;
    setSelected(i);
    setPhase(i === question.answer ? 'correct' : 'wrong');
  };

  const mascotMood: CakeyMood =
    mode === 'trivia'
      ? phase === 'correct'
        ? 'celebrate'
        : phase === 'wrong'
          ? 'idle'
          : 'happy'
      : mode === 'joke'
        ? jokeRevealed
          ? 'celebrate'
          : 'happy'
        : mode === 'whatsnew'
          ? 'happy'
          : 'wave';

  // Cakey's current speech-bubble text for the panel header.
  let bubble: React.ReactNode = helloLine;
  if (mode === 'menu') bubble = greeting(displayName);
  else if (mode === 'hi') bubble = helloLine;
  else if (mode === 'trivia') {
    bubble =
      phase === 'correct'
        ? question!.funFact
        : phase === 'wrong'
          ? (
              <>
                Oops! It was <strong>{question!.choices[question!.answer]}</strong>. Now you know! 🍰
              </>
            )
          : introLine;
  } else if (mode === 'whatsnew') {
    bubble = newsLines[Math.min(lineIdx, newsLines.length - 1)] ?? 'All quiet in the Story Oven.';
  } else if (mode === 'joke') {
    bubble = joke ? (jokeRevealed ? joke.punchline : joke.setup) : 'Let me think of a good one…';
  } else if (mode === 'story') {
    bubble = 'Pick a story and I’ll show you again! 🎬';
  } else if (mode === 'quiz') {
    bubble = 'Ten quick sprinkles: five math, five words. Let’s find your just-right level! ⚡';
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 pb-8 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Cakey"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Cakey + speech bubble */}
        <div className="mb-4 flex items-end gap-3">
          <GamecakesMascot mood={mascotMood} size={72} />
          <div className="relative flex-1 rounded-3xl rounded-bl-md bg-amber-50 px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-zinc-100">
            {/* `bubble` is sometimes JSX, not a line — only the string form is speech. */}
            {typeof bubble === 'string' ? <SpokenText text={bubble} /> : bubble}
            <span
              className="absolute -bottom-2 left-4 h-0 w-0 border-l-8 border-t-8 border-transparent border-t-amber-50 dark:border-t-zinc-700"
              aria-hidden
            />
          </div>
        </div>

        {/* Body per mode */}
        {mode === 'menu' || mode === 'hi' ? (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={startTrivia}
              className="rounded-2xl bg-amber-100 px-5 py-3 text-left text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-200 active:scale-95 dark:bg-amber-900/40 dark:text-amber-200"
            >
              🎲 Quick trivia with Cakey
            </button>
            <button
              type="button"
              onClick={() => {
                speakLine('Ten quick sprinkles: five math, five words. Let’s find your just-right level!');
                setMode('quiz');
              }}
              className="rounded-2xl bg-gradient-to-r from-sky-100 to-violet-100 px-5 py-3 text-left text-sm font-black text-indigo-900 shadow-sm transition hover:from-sky-200 hover:to-violet-200 active:scale-95 dark:from-sky-900/50 dark:to-violet-900/50 dark:text-indigo-100"
            >
              ⚡ Quiz me: 10-question lightning round
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('hi');
                speakLine(pickLine(SOCKS_AND_SHOES_LINES).line);
              }}
              className="rounded-2xl bg-teal-100 px-5 py-3 text-left text-sm font-bold text-teal-900 shadow-sm transition hover:bg-teal-200 active:scale-95 dark:bg-teal-900/40 dark:text-teal-200"
            >
              🧦 What&rsquo;s the deal with socks?
            </button>
            {onOpenGarage ? (
              <button
                type="button"
                onClick={onOpenGarage}
                className="rounded-2xl bg-emerald-100 px-5 py-3 text-left text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-200 active:scale-95 dark:bg-emerald-900/40 dark:text-emerald-200"
              >
                🚙 Rent me a ride
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEntryIdx(0);
                setLineIdx(0);
                setMode('whatsnew');
              }}
              className="rounded-2xl bg-sky-100 px-5 py-3 text-left text-sm font-bold text-sky-900 shadow-sm transition hover:bg-sky-200 active:scale-95 dark:bg-sky-900/40 dark:text-sky-200"
            >
              ✨ What&rsquo;s new from the Story Oven
            </button>
            <button
              type="button"
              onClick={startJoke}
              className="rounded-2xl bg-violet-100 px-5 py-3 text-left text-sm font-bold text-violet-900 shadow-sm transition hover:bg-violet-200 active:scale-95 dark:bg-violet-900/40 dark:text-violet-200"
            >
              🤪 Tell me a dad joke
            </button>
            {onPlayStory && STORY_EVENTS.length > 0 ? (
              <button
                type="button"
                onClick={() => setMode('story')}
                className="rounded-2xl bg-amber-100 px-5 py-3 text-left text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-200 active:scale-95 dark:bg-amber-900/40 dark:text-amber-200"
              >
                🎬 Watch a Story again
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMode('hi');
                speakLine(pickLine(HELLO_LINES).line);
              }}
              className="rounded-2xl bg-rose-100 px-5 py-3 text-left text-sm font-bold text-rose-900 shadow-sm transition hover:bg-rose-200 active:scale-95 dark:bg-rose-900/40 dark:text-rose-200"
            >
              👋 Just saying hi
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-full px-5 py-3 text-sm font-bold text-zinc-500 transition hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Bye, Cakey
            </button>
          </div>
        ) : null}

        {mode === 'trivia' && question ? (
          <div>
            <p className="mb-4 text-center text-base font-bold text-zinc-800 dark:text-zinc-100">
              {question.q}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {question.choices.map((choice, i) => {
                const isAnswer = i === question.answer;
                const isSelected = selected === i;
                const isAnswered = selected !== null;
                let cls =
                  'rounded-2xl border-2 px-4 py-3 text-sm font-semibold text-left transition active:scale-95 disabled:cursor-default ';
                if (!isAnswered) {
                  cls +=
                    'border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-amber-50 hover:border-amber-300 dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-100';
                } else if (isAnswer) {
                  cls +=
                    'border-emerald-400 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
                } else if (isSelected) {
                  cls += 'border-rose-400 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200';
                } else {
                  cls +=
                    'border-zinc-100 bg-zinc-50 text-zinc-400 opacity-50 dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-500';
                }
                return (
                  <button
                    key={i}
                    onClick={() => choose(i)}
                    disabled={isAnswered}
                    className={cls}
                    aria-pressed={isSelected ? true : undefined}
                  >
                    {choice}
                    {isAnswered && isAnswer && ' ✓'}
                  </button>
                );
              })}
            </div>
            {selected !== null ? (
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={startTrivia}
                  className="rounded-full bg-amber-400 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-amber-500 active:scale-95"
                >
                  🎲 Another one!
                </button>
                <button
                  type="button"
                  onClick={() => setMode('menu')}
                  className="rounded-full bg-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
                >
                  Back
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === 'quiz' ? (
          <CakeyLightningQuiz onBack={() => setMode('menu')} />
        ) : null}

        {mode === 'whatsnew' ? (
          <div className="flex justify-center gap-3">
            {lineIdx < newsLines.length - 1 ? (
              <button
                type="button"
                onClick={() => setLineIdx((n) => n + 1)}
                className="rounded-full bg-sky-400 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-500 active:scale-95"
              >
                ▶ Next
              </button>
            ) : WHATS_NEW.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setEntryIdx((n) => (n + 1) % WHATS_NEW.length);
                  setLineIdx(0);
                }}
                className="rounded-full bg-sky-400 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-500 active:scale-95"
              >
                🍰 Another update
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="rounded-full bg-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
            >
              Back
            </button>
          </div>
        ) : null}

        {mode === 'joke' && joke ? (
          <div className="flex justify-center gap-3">
            {!jokeRevealed ? (
              <button
                type="button"
                onClick={() => {
                  setJokeRevealed(true);
                  if (joke) speakLine(joke.punchline);
                }}
                className="rounded-full bg-violet-400 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-500 active:scale-95"
              >
                🥁 …go on
              </button>
            ) : (
              <button
                type="button"
                onClick={startJoke}
                className="rounded-full bg-violet-400 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-500 active:scale-95"
              >
                😂 Another one!
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="rounded-full bg-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
            >
              Back
            </button>
          </div>
        ) : null}

        {mode === 'story' ? (
          <div className="flex flex-col gap-2.5">
            {STORY_EVENTS.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => onPlayStory?.(s.slug)}
                className="flex items-center gap-3 rounded-2xl bg-amber-100 px-5 py-3 text-left text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-200 active:scale-95 dark:bg-amber-900/40 dark:text-amber-200"
              >
                <span className="text-xl" aria-hidden>
                  {s.icon}
                </span>
                <span>{s.title}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="mt-1 rounded-full bg-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
            >
              Back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
