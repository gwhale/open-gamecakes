'use client';

// Cakey's Candles — hear the word, spell it before the candles go out.
//
// The guess-a-letter game, without the gallows. A birthday cake carries one
// candle per allowed miss; a wrong letter blows one out, and when the last one
// goes the word is shown and said, and the kid moves on to the next word. No
// figure, no rope, nothing that a seven-year-old has to be told not to think
// about. The slug is `hangman` so grown-ups can find it; nothing on screen
// uses the word.
//
// THE WORD IS AUDIO. Cakey says it (a rendered clip for library words, the
// browser voice for a class list) and it is never printed until the word is
// solved or lost — printing it next to the tiles would turn spelling into
// letter-matching. The 🔊 button replays it as often as the kid likes. A word
// that carries a definition from the parent's list shows that as a hint.
//
// Round = several words, no clock. The WORD is the unit of evidence — a wrong
// letter is how the game is played, not a wrong answer — so the summary is
// solved / total, and the misses only go on the meta line.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CandyButton } from '@/components/ui/CandyButton';
import { makeRng } from '@/lib/games/opponents/rng';
import {
  isSoundEnabled,
  playCorrect,
  playTap,
  playWin,
  playWrong,
  setSoundEnabled,
  subscribeSound,
} from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticTap, hapticThump, hapticWrong } from '@/lib/haptics';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { speakSilently } from '@/lib/town/cakey-voice';
import { wordsForRound, type WordSource } from '@/lib/games/words/pool';
import {
  candlesLeft,
  guess,
  isLost,
  isWon,
  masked,
  maxMissesForTier,
  newRound,
  revealsVowels,
  wrongLetters,
  VOWELS,
  type CandleState,
} from '@/lib/games/hangman/state';

/** Words per round. Five is one short spelling test — long enough to be a
 *  round, short enough that a kid who loses two still wants the third. A
 *  class list shorter than this gives a shorter round. */
// Three, not five. A five-word round at 8 candles let a bad round end on
// "37 candles blown out"; three words at six candles caps a round at 18 misses,
// the scale a hangman round is usually played at. Still >= MIN_EVIDENCE_ANSWERS
// (3), so a round always counts as evidence.
export const WORDS_PER_ROUND = 3;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

interface Round {
  words: string[];
  glosses: Record<string, string>;
  source: WordSource;
  maxMisses: number;
  reveal: readonly string[];
}

function buildRound(level: number): Round {
  const rng = makeRng(Date.now() % 2147483647);
  const pool = wordsForRound('spelling', level, WORDS_PER_ROUND, rng);
  return {
    words: pool.words,
    glosses: pool.glosses,
    source: pool.source,
    maxMisses: maxMissesForTier(level),
    reveal: revealsVowels(level) ? VOWELS : [],
  };
}

interface Props {
  /** Launcher level, 1..10. */
  level: number;
  onComplete: (summary: SessionSummary) => void;
}

export default function CandlesGame({ level, onComplete }: Props) {
  // Lazy initialisers; the shell remounts for a new round (see WordMemoryGame).
  const [round] = useState<Round>(() => buildRound(level));
  const [sessionStart] = useState<number>(() => Date.now());
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<CandleState>(() =>
    newRound(round.words[0] ?? 'cake', round.maxMisses, round.reveal),
  );
  const [solved, setSolved] = useState(0);
  const [lost, setLost] = useState(0);
  const [missesTotal, setMissesTotal] = useState(0);
  const completedRef = useRef(false);

  const total = round.words.length;
  const won = isWon(state);
  const gone = isLost(state);
  const over = won || gone;
  const gloss = round.glosses[state.word];
  const tiles = over ? state.word.split('') : masked(state);
  const isLast = index >= total - 1;

  // Say the word when it arrives. speakSilently cancels anything already
  // playing, so Strict Mode's double effect costs nothing audible. Autoplay
  // policy can refuse this first one on iOS — the 🔊 button is the recovery.
  useEffect(() => {
    speakSilently(state.word);
    // Only when the WORD changes, not on every guess.
  }, [state.word]);

  // The word is the whole clue, and it is spoken — so with sound OFF the kid
  // has a row of blanks and nothing else. speakSilently no-ops when muted (by
  // design: a muted game must not talk), which left this game silently
  // unplayable. Track the toggle live: while muted, the 🔊 button becomes a
  // "turn sound on" button, and flipping sound on says the current word at
  // once so the kid is not left waiting for the next one. Starts true so the
  // server render matches the toggle's own optimistic default.
  const soundOn = useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
  const prevSoundOn = useRef(true);
  useEffect(() => {
    const justTurnedOn = soundOn && !prevSoundOn.current;
    prevSoundOn.current = soundOn;
    // A word change is spoken by the effect above; this covers only the
    // mute → unmute transition, so nothing is said twice.
    if (justTurnedOn) speakSilently(state.word);
  }, [soundOn, state.word]);

  const tryLetter = useCallback(
    (letter: string): void => {
      if (over) return;
      const next = guess(state, letter);
      if (next === state) return; // repeat, non-letter — silent no-op
      setState(next);
      const hit = next.misses === state.misses;
      if (hit) {
        playTap();
        hapticTap();
      } else {
        playWrong();
        hapticWrong();
        setMissesTotal((m) => m + 1);
      }
      if (isWon(next)) {
        playCorrect();
        hapticThump();
        setSolved((s) => s + 1);
        speakSilently(next.word);
      } else if (isLost(next)) {
        setLost((l) => l + 1);
        // Hearing it once more with the letters on screen is the lesson.
        speakSilently(next.word);
      }
    },
    [state, over],
  );

  // Physical keyboard, for a laptop or a tablet with one attached. Re-attached
  // whenever the handler changes (every guess); cheaper than a ref and it
  // keeps the render phase free of ref writes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 && /[a-z]/i.test(e.key)) tryLetter(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tryLetter]);

  const advance = (): void => {
    if (!over) return;
    if (isLast) {
      if (completedRef.current) return;
      completedRef.current = true;
      playWin();
      hapticSuccess();
      onComplete(
        buildSessionSummary({
          score: solved,
          wrongAnswers: lost,
          sessionStart,
          completed: true,
          optimalTaps: total,
          metaLines: [
            `${solved} of ${total} words`,
            missesTotal === 0
              ? 'Not one candle blown out!'
              : `${missesTotal} candle${missesTotal === 1 ? '' : 's'} blown out`,
          ],
        }),
      );
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setState(newRound(round.words[nextIndex], round.maxMisses, round.reveal));
  };

  const lit = candlesLeft(state);
  const misses = wrongLetters(state);

  return (
    <div className="w-full max-w-xl select-none">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 text-rose-900 dark:text-rose-100">
        <h2 className="font-display text-lg font-bold sm:text-xl">
          {round.source === 'class' ? (
            <>
              <span aria-hidden>📝 </span>From your word list
            </>
          ) : (
            <>
              Level <span className="text-rose-600 dark:text-rose-300">{level}</span>
            </>
          )}
        </h2>
        <div className="flex items-baseline gap-4 text-sm text-rose-800/80 dark:text-rose-200/80">
          <span>
            Word <b className="font-mono text-rose-900 dark:text-rose-50">{index + 1}/{total}</b>
          </span>
          <span>
            Spelled <b className="font-mono text-rose-900 dark:text-rose-50">{solved}</b>
          </span>
        </div>
      </div>

      {/* The cake. Three layers in the brand order — rose, cream, mint — with
          a candle per miss allowed. */}
      <div className="rounded-3xl bg-white/80 px-4 pb-4 pt-6 shadow-[0_10px_30px_-10px_rgba(251,113,133,0.45)] dark:bg-zinc-900/80">
        <Cake lit={lit} total={state.maxMisses} />

        <p className="mt-4 text-center font-display text-base font-bold text-rose-900 dark:text-rose-100" aria-live="polite">
          {won
            ? 'You spelled it! 🎉'
            : gone
              ? 'All the candles went out. The word was…'
              : lit === 1
                ? 'One candle left — take your time.'
                : 'Listen. What word did Cakey say?'}
        </p>

        {/* The word, as tiles. Letters only appear as they are guessed. */}
        <div
          className="mt-3 flex flex-wrap justify-center gap-1.5 sm:gap-2"
          role="group"
          aria-label={over ? `The word was ${state.word}` : `${tiles.length} letters`}
        >
          {tiles.map((ch, i) => (
            <span
              key={i}
              className={`flex h-12 w-10 items-center justify-center rounded-lg border-b-4 font-display text-2xl font-bold sm:h-14 sm:w-12 sm:text-3xl ${
                won
                  ? 'border-emerald-500 bg-emerald-100 text-emerald-950'
                  : gone
                    ? 'border-rose-500 bg-rose-100 text-rose-950'
                    : ch === '_'
                      ? 'border-rose-300 bg-rose-50 text-transparent dark:bg-zinc-800'
                      : 'border-amber-400 bg-amber-100 text-amber-950'
              }`}
              aria-hidden
            >
              {ch === '_' ? '·' : ch.toUpperCase()}
            </span>
          ))}
        </div>

        {gloss ? (
          <p className="mt-3 text-center text-sm text-rose-800/80 dark:text-rose-200/80">
            <span className="font-semibold">Hint:</span> means &ldquo;{gloss}&rdquo;
          </p>
        ) : null}

        {!soundOn ? (
          <p
            role="status"
            className="mt-3 text-center text-sm font-semibold text-rose-800 dark:text-rose-200"
          >
            Sound is off, so Cakey can&rsquo;t say the word. Turn it on to hear it.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {soundOn ? (
            <CandyButton
              role="act"
              shape="pill"
              size="md"
              onClick={() => speakSilently(state.word)}
              aria-label="Say the word again"
            >
              <span aria-hidden>🔊</span> Say it again
            </CandyButton>
          ) : (
            <CandyButton
              role="act"
              shape="pill"
              size="md"
              onClick={() => setSoundEnabled(true)}
              aria-label="Turn sound on and say the word"
            >
              <span aria-hidden>🔊</span> Turn sound on
            </CandyButton>
          )}
          {over ? (
            <CandyButton role={won ? 'grow' : 'travel'} shape="pill" size="md" onClick={advance}>
              {isLast ? 'See how you did' : 'Next word'} <span aria-hidden>→</span>
            </CandyButton>
          ) : null}
        </div>

        {misses.length > 0 && !over ? (
          <p className="mt-3 text-center text-xs text-rose-800/70 dark:text-rose-200/70">
            Not in it: <span className="font-mono uppercase tracking-widest">{misses.join(' ')}</span>
          </p>
        ) : null}
      </div>

      {/* Keypad. Every key is a real 44 px button; tried letters go inert
          (flat, still readable — never opacity-50) and show whether they hit. */}
      <div
        className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-9 sm:gap-2"
        role="group"
        aria-label="Letters"
      >
        {LETTERS.map((l) => {
          const tried = state.guessed.includes(l);
          const inWord = tried && state.word.includes(l);
          const tone = !tried
            ? 'candy-shell bg-white text-rose-900 hover:brightness-105 active:scale-95 dark:bg-zinc-800 dark:text-rose-100'
            : inWord
              ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
              : 'bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-700 dark:text-zinc-300';
          return (
            <button
              key={l}
              type="button"
              disabled={tried || over}
              aria-label={tried ? `${l.toUpperCase()}, tried` : l.toUpperCase()}
              onClick={() => tryLetter(l)}
              className={`chrome-focus flex items-center justify-center rounded-xl font-display text-xl font-bold transition-[transform,filter] duration-100 ${tone}`}
              style={
                !tried
                  ? ({
                      minHeight: 'var(--min-tap-target)',
                      '--c-from': '#ffffff',
                      '--c-to': '#fff1f2',
                      '--c-ink': '#881337',
                      '--c-glow': 'rgba(251, 113, 133, 0.35)',
                    } as React.CSSProperties)
                  : { minHeight: 'var(--min-tap-target)' }
              }
            >
              {l.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The cake with its candles. `lit` of `total` are still burning. Lit flames
 *  flicker under motion-safe only; a blown-out candle is a grey wick with a
 *  little smoke, and the difference reads without any motion at all. */
function Cake({ lit, total }: { lit: number; total: number }) {
  return (
    <div className="mx-auto w-full max-w-xs" aria-label={`${lit} of ${total} candles lit`} role="img">
      <div className="flex items-end justify-center gap-2 px-6">
        {Array.from({ length: total }, (_, i) => {
          const on = i < lit;
          return (
            <div key={i} className="flex flex-col items-center" style={{ width: `${Math.min(28, 200 / total)}px` }}>
              {on ? (
                <span
                  className="h-4 w-3 rounded-full motion-safe:animate-pulse"
                  style={{ background: 'radial-gradient(circle at 50% 70%, #fbbf24 0%, #f97316 60%, transparent 75%)' }}
                />
              ) : (
                <span className="h-4 w-3 text-center text-[10px] leading-4 text-zinc-400" aria-hidden>
                  ~
                </span>
              )}
              <span
                className={`mt-0.5 h-7 w-2 rounded-sm ${on ? 'bg-sky-300' : 'bg-zinc-300 dark:bg-zinc-600'}`}
              />
            </div>
          );
        })}
      </div>
      {/* Three layers, the Layer Rule: rose, cream, mint. */}
      <div className="mx-4 h-5 rounded-t-xl bg-rose-300" />
      <div className="mx-2 h-5 bg-amber-200" />
      <div className="h-6 rounded-b-2xl bg-emerald-300" />
      <div className="mx-auto mt-1 h-2 w-[110%] -translate-x-[4.5%] rounded-full bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}
