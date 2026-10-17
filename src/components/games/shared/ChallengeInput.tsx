'use client';

// Shared challenge answer UI — the prompt + input region of a challenge modal.
//
// One implementation for BOTH question kinds (see challenge.ts):
//   * kind:'numeric' → the 0-9 keypad (with keyboard shortcuts)
//   * kind:'choice'  → a vertical button stack (vocabulary / reading)
//
// It renders ONLY the prompt + input, not the surrounding dialog. Every host
// keeps its own modal chrome (reason header, timer bars, wrong-flash, etc.)
// and drops this in where the answer UI goes, so a 2D Phaser game and a 3D
// Three.js game pose math OR verbal questions through identical UI. The
// component owns the typed value + correctness check and reports the result
// via `onAnswer(correct, given)`; the host decides what a correct/wrong answer
// does.
//
// `given` is the RAW thing the kid entered. Most hosts ignore it — they only
// care whether it was right. The treasure-chest gate needs it because the
// SERVER marks that one, and a client that reports its own verdict is one
// devtools call from opening every chest in the ocean.
//
// Extracted from PhaserGameHost's inline modal so the 3D hosts (which had
// numeric-only hand-rolled keypads) can render choice questions too.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Challenge, Figure } from '@/lib/games/shared/challenge';
import { playPadPress } from '@/lib/games/shared/sounds';
import {
  isTalking,
  speakLinesSilently,
  stopSpeaking,
  subscribeTalking,
} from '@/lib/town/cakey-voice';
import {
  REACTION_LINES,
  emitCakeyEvent,
  getReaction,
  registerSideCakey,
  subscribeCakeyView,
} from '@/lib/games/shared/cakey-react';
import { spokenQuestion } from '@/lib/games/shared/question-speech';
import GamecakesMascot from '@/components/GamecakesMascot';

/** How long a wrong answer stays on screen, in red, before the host hears
 *  about it. Every host closes this dialog the moment it gets an answer, so a
 *  flash the host starts itself is unmounted before it paints; holding the
 *  report here is the only way the kid sees which answer was wrong. */
const WRONG_HOLD_MS = 600;

export default function ChallengeInput({
  challenge,
  onAnswer,
  flashWrong = false,
  enableKeyboard = true,
  nested = false,
}: {
  challenge: Challenge;
  /** Called once the player commits an answer (Go on the keypad, or a choice
   *  tap). `correct` is decided here; the host handles the consequence.
   *
   *  `given` is what the kid actually entered, for hosts that must have their
   *  answer marked somewhere other than this component (see the chest gate).
   *  Absent for multi-part questions, whose correctness is not one value. */
  onAnswer: (correct: boolean, given?: string) => void;
  /** Host-controlled wrong-answer flash on the numeric input box / choices. */
  flashWrong?: boolean;
  /** Wire 0-9 / Backspace / Enter to the keypad. Off for hosts that already
   *  own conflicting key handlers. Only affects numeric challenges. */
  enableKeyboard?: boolean;
  /** Internal: this instance is one part of a multi-step question. The outer
   *  instance owns the Cakey question-open / answered events, so a part never
   *  reports them a second time. */
  nested?: boolean;
}) {
  const [inputValue, setInputValue] = useState('');

  // Every answer goes through here so the corner Cakey (CakeyReactions) can
  // react after the host has already closed this dialog.
  const report = useCallback(
    (correct: boolean, given?: string) => {
      if (!nested) emitCakeyEvent({ type: 'answered', correct });
      onAnswer(correct, given);
    },
    [nested, onAnswer],
  );

  // A wrong answer being shown before it is reported: the raw entry, or null.
  // Input is ignored while it is up. The pending report is cancelled if the
  // host closes or re-poses first (a timer ran out), so it never lands late.
  const [wrongShown, setWrongShown] = useState<string | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current = null;
    },
    [challenge],
  );
  const commit = useCallback(
    (correct: boolean, given: string) => {
      if (correct) return report(true, given);
      setWrongShown(given);
      wrongTimer.current = setTimeout(() => {
        wrongTimer.current = null;
        setWrongShown(null);
        report(false, given);
      }, WRONG_HOLD_MS);
    },
    [report],
  );
  const holding = wrongShown !== null;
  const showWrong = flashWrong || holding;

  // A question is open while this is mounted with this challenge: Cakey starts
  // his hesitation clock, and stops it when the host closes or re-poses.
  useEffect(() => {
    if (nested) return;
    emitCakeyEvent({ type: 'question-open' });
    return () => emitCakeyEvent({ type: 'question-close' });
  }, [nested, challenge]);

  // A fresh challenge object means a new question — clear the typed value.
  // Done during render (React's "adjust state when a prop changes" pattern)
  // rather than in an effect, so it also covers hosts that re-pose a new
  // challenge without unmounting the modal (e.g. Sandcastle, Castle Crumble).
  const [seenChallenge, setSeenChallenge] = useState(challenge);
  // Which part of a multi-step question we are on. Meaningless for the two
  // leaf kinds, but hooks cannot be conditional.
  const [stepIndex, setStepIndex] = useState(0);
  if (challenge !== seenChallenge) {
    setSeenChallenge(challenge);
    setInputValue('');
    setStepIndex(0);
    setWrongShown(null);
  }

  // Five digits, not three. The cap used to be three, which silently made
  // every four-digit answer impossible to enter — tier 8 arithmetic reaches
  // 1,000 and tier 9 reaches 10,000, so a fifth grader could be posed a
  // question the keypad would not let them answer. Five covers the largest
  // answer any generator produces, and still stops a kid leaning on a key.
  const handleDigit = useCallback(
    (d: string) => {
      if (holding) return;
      playPadPress();
      emitCakeyEvent({ type: 'activity' });
      setInputValue((v) => (v.length >= 5 ? v : v + d));
    },
    [holding],
  );

  const handleClear = useCallback(() => {
    if (holding) return;
    emitCakeyEvent({ type: 'activity' });
    setInputValue('');
  }, [holding]);

  const handleSubmit = useCallback(() => {
    if (holding || challenge.kind !== 'numeric' || inputValue === '') return;
    const submitted = Number.parseInt(inputValue, 10);
    if (!Number.isFinite(submitted)) return;
    commit(submitted === challenge.answer, inputValue);
  }, [holding, challenge, inputValue, commit]);

  const handleChoice = useCallback(
    (choice: string) => {
      if (holding || challenge.kind !== 'choice') return;
      commit(choice === challenge.answer, choice);
    },
    [holding, challenge, commit],
  );

  // One step's result, from the nested ChallengeInput below. A wrong part ends
  // the whole question: "show your work" means the work has to be right, and
  // letting a kid stumble into the right final answer off a wrong first step
  // would credit exactly the thing the item was written to catch.
  const handleStepAnswer = useCallback(
    (correct: boolean) => {
      if (challenge.kind !== 'steps') return;
      if (!correct) return report(false);
      if (stepIndex >= challenge.steps.length - 1) return report(true);
      setStepIndex((i) => i + 1);
    },
    [challenge, stepIndex, report],
  );

  // Read the whole question aloud as it opens (see question-speech.ts) — it
  // used to say only a spelling question's word, and nothing at all for the
  // rest. Depends on the challenge OBJECT, so a host that re-poses without
  // unmounting (Sandcastle, Castle Crumble) reads the new one. A multi-part
  // question reads its scenario with part 1, then each later part on its own;
  // the nested parts never speak, the outer instance does it for them. Stops
  // when the dialog closes, so a long passage does not run on into the game.
  // iOS may refuse this without a gesture — the 🔊 button is the guaranteed
  // path, this is the convenience.
  useEffect(() => {
    if (nested) return;
    const part = challenge.kind === 'steps' && stepIndex > 0 ? challenge.steps[stepIndex] : null;
    speakLinesSilently(spokenQuestion(part ?? challenge));
    return () => stopSpeaking();
  }, [nested, challenge, stepIndex]);

  // Keyboard shortcuts — only meaningful for the numeric keypad.
  useEffect(() => {
    if (!enableKeyboard || challenge.kind !== 'numeric') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === 'Backspace' || e.key === 'Delete') handleClear();
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enableKeyboard, challenge, handleDigit, handleClear, handleSubmit]);

  if (challenge.kind === 'numeric') {
    return (
      <>
        {/* Verbatim prompts are full equations ("7 + ❓ = 10") — render as-is,
            one size down so they fit. Otherwise append the " = ?" suffix. */}
        <div
          className={`relative mt-3 text-center font-bold tabular-nums ${
            challenge.verbatim ? 'text-4xl' : 'text-5xl'
          }`}
        >
          {nested ? null : <QuestionCakey />}
          {challenge.verbatim ? challenge.prompt : `${challenge.prompt} = ?`}
        </div>
        <div
          className={`mt-5 rounded-2xl border-2 p-4 text-center text-4xl font-mono font-bold tabular-nums ${
            showWrong
              ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
          }`}
          aria-live="polite"
        >
          {inputValue || ' '}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <PadBtn key={d} onClick={() => handleDigit(d)}>
              {d}
            </PadBtn>
          ))}
          <PadBtn onClick={handleClear} variant="muted">
            C
          </PadBtn>
          <PadBtn onClick={() => handleDigit('0')}>0</PadBtn>
          <PadBtn onClick={handleSubmit} variant="primary" disabled={inputValue === '' || holding}>
            Go
          </PadBtn>
        </div>
      </>
    );
  }

  // A question in parts. The scenario stays put and the current part is
  // rendered by this same component one level down — so a step is drawn by
  // exactly the keypad or button stack it would get on its own, and nothing
  // here duplicates that markup.
  if (challenge.kind === 'steps') {
    const step = challenge.steps[stepIndex];
    return (
      <>
        <div className="relative mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-center text-lg font-semibold text-zinc-900 dark:bg-amber-950/40 dark:text-zinc-100">
          <QuestionCakey />
          {challenge.prompt}
        </div>
        {challenge.subtext ? (
          <div className="mt-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {challenge.subtext}
          </div>
        ) : null}
        <div className="mt-3 text-center text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Part {stepIndex + 1} of {challenge.steps.length}
        </div>
        {/* `step` is the object the generator built, not one made during
            render, so the nested input's "new challenge → clear input" check
            stays stable while the kid is typing. */}
        <ChallengeInput
          challenge={step}
          onAnswer={handleStepAnswer}
          flashWrong={flashWrong}
          enableKeyboard={enableKeyboard}
          nested
        />
      </>
    );
  }

  return (
    <>
      <div className="relative mt-3 flex items-center justify-center gap-2">
        {nested ? null : <QuestionCakey />}
        <div className="text-center text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {challenge.prompt}
        </div>
        {/* Replay. A spelling question is unanswerable if the audio was missed
            — muted iPad, someone walked past, autoplay refused — so the way to
            hear it again is always on screen, never a hidden gesture. Every
            choice question is read aloud now, so every one gets it. */}
        <button
          type="button"
          onClick={() => {
            emitCakeyEvent({ type: 'activity' });
            speakLinesSilently(spokenQuestion(challenge));
          }}
          aria-label="Say it again"
          className="shrink-0 rounded-full bg-sky-100 px-3 py-2 text-xl transition-all hover:bg-sky-200 active:scale-90 dark:bg-sky-950 dark:hover:bg-sky-900"
          style={{ minWidth: 'var(--min-tap-target)', minHeight: 'var(--min-tap-target)' }}
        >
          🔊
        </button>
      </div>
      {challenge.subtext ? (
        <div className="mt-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
          {challenge.subtext}
        </div>
      ) : null}
      {challenge.figures?.length ? (
        <div className="mt-4 flex items-end justify-center gap-6">
          {challenge.figures.map((f, i) => (
            <FigureSvg key={i} figure={f} />
          ))}
        </div>
      ) : null}
      <div
        className={`mt-5 flex flex-col gap-3 ${flashWrong ? 'animate-pulse' : ''}`}
        aria-live="polite"
      >
        {challenge.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => handleChoice(choice)}
            className={`rounded-2xl border-2 px-4 py-4 text-xl font-bold transition-all active:scale-[0.98] ${
              wrongShown === choice
                ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-sky-400 hover:bg-sky-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-sky-700 dark:hover:bg-sky-950'
            }`}
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {choice}
          </button>
        ))}
      </div>
    </>
  );
}

/** Cakey, beside the question dialog, mouth moving while the question is read.
 *
 *  Hangs off the left edge of the card rather than sitting inside it, so it
 *  takes no room from the prompt or the answers and cannot cover either: every
 *  host's card is at most 28rem wide and centred (Pit Stop docks it right),
 *  which leaves room beside it from the `sm` breakpoint up. Between `sm` and
 *  `md` he is drawn at 70% so even a 28rem card at 640px still clears him. Below
 *  `sm` there is no room, so he is not drawn; the question is still read and
 *  the corner Cakey (CakeyReactions) handles reactions as before.
 *
 *  While drawn he is the ONLY Cakey: he registers himself, the corner one
 *  hides, and the think / oops / cheer reactions show here with their line in
 *  a small bubble under him. Talking wins over a reaction — he finishes reading
 *  first.
 *
 *  The parent must be `relative`. Decorative — the voice, the printed question
 *  and the corner's screen-reader line carry everything — so aria-hidden. */
const SIDE_CAKEY_QUERY = '(min-width: 640px)';

function subscribeWide(fn: () => void): () => void {
  const mq = window.matchMedia(SIDE_CAKEY_QUERY);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

function QuestionCakey() {
  const talking = useSyncExternalStore(subscribeTalking, isTalking, () => false);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(SIDE_CAKEY_QUERY).matches,
    () => false,
  );
  const reaction = useSyncExternalStore(subscribeCakeyView, getReaction, () => null);
  useEffect(() => (wide ? registerSideCakey() : undefined), [wide]);

  if (!wide) return null;
  const shown = talking ? null : reaction;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-full top-1/2 mr-8 origin-right -translate-y-1/2 scale-70 md:scale-100"
    >
      <GamecakesMascot size={120} mood={shown ?? 'idle'} talking={talking} />
      {shown ? (
        <div className="absolute right-0 top-full mt-1 w-max max-w-[7.5rem] rounded-2xl text-center bg-white/95 px-3 py-2 text-sm font-bold leading-snug text-zinc-800 shadow-lg dark:bg-zinc-900/95 dark:text-zinc-100">
          {REACTION_LINES[shown]}
        </div>
      ) : null}
    </div>
  );
}

function PadBtn({
  children,
  onClick,
  variant = 'default',
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'muted';
  disabled?: boolean;
}) {
  const base = 'rounded-2xl text-2xl font-bold active:scale-95 disabled:opacity-40';
  const cls =
    variant === 'primary'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
      : variant === 'muted'
        ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300'
        : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${cls}`}
      style={{ minHeight: 'var(--min-tap-target)', padding: '14px 0' }}
    >
      {children}
    </button>
  );
}


/** One shape, divided into equal parts, some of them filled.
 *
 *  Inline SVG rather than an image: it has to be legible at any size, take its
 *  colours from the theme, and never be a network request a gate is waiting on.
 *  Filled parts use the brand strawberry; empty ones stay on the page ground so
 *  the division lines are what the eye reads.
 */
function FigureSvg({ figure }: { figure: Figure }) {
  const { shape, total, shaded, rows = 1, label } = figure;
  const S = 132;
  const FILL = '#F2789F';
  const EMPTY = 'rgba(0,0,0,0.04)';
  const LINE = 'currentColor';
  const parts: React.ReactNode[] = [];

  if (shape === 'circle') {
    const r = S / 2 - 6;
    const cx = S / 2;
    const cy = S / 2;
    for (let i = 0; i < total; i += 1) {
      // A single part is a whole circle — a wedge path with equal start and end
      // angles draws nothing at all.
      if (total === 1) {
        parts.push(
          <circle key={i} cx={cx} cy={cy} r={r} fill={i < shaded ? FILL : EMPTY} />,
        );
        continue;
      }
      const a0 = (i / total) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / total) * Math.PI * 2 - Math.PI / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = [
        `M ${cx} ${cy}`,
        `L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}`,
        `A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
        'Z',
      ].join(' ');
      parts.push(
        <path key={i} d={d} fill={i < shaded ? FILL : EMPTY} stroke={LINE} strokeWidth="2" />,
      );
    }
    if (total === 1) {
      parts.push(
        <circle key="ring" cx={cx} cy={cy} r={r} fill="none" stroke={LINE} strokeWidth="2" />,
      );
    }
  } else {
    // bar = one row of `total`; grid = `rows` rows of `total`.
    const cols = total;
    const rowCount = shape === 'grid' ? Math.max(1, rows) : 1;
    const w = (S - 8) / cols;
    const h = shape === 'grid' ? Math.min(w, (S - 8) / rowCount) : 48;
    let n = 0;
    for (let r0 = 0; r0 < rowCount; r0 += 1) {
      for (let c = 0; c < cols; c += 1) {
        parts.push(
          <rect
            key={`${r0}-${c}`}
            x={4 + c * w}
            y={4 + r0 * h}
            width={w}
            height={h}
            fill={n++ < shaded ? FILL : EMPTY}
            stroke={LINE}
            strokeWidth="2"
          />,
        );
      }
    }
  }

  const height =
    shape === 'circle' ? S : shape === 'grid' ? 8 + Math.max(1, rows) * Math.min((S - 8) / total, (S - 8) / Math.max(1, rows)) : 56;

  return (
    <figure className="m-0 flex flex-col items-center gap-1 text-zinc-400 dark:text-zinc-500">
      <svg
        viewBox={`0 0 ${S} ${height}`}
        width={S}
        height={height}
        role="img"
        aria-label={`${shaded} of ${shape === 'grid' ? total * Math.max(1, rows) : total} parts filled`}
      >
        {parts}
      </svg>
      {label ? (
        <figcaption className="text-sm font-bold text-zinc-600 dark:text-zinc-300">
          {label}
        </figcaption>
      ) : null}
    </figure>
  );
}
