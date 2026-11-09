'use client';

// CakeyTalk — the conversation when a kid taps Cakey in the town.
//
// A story card, not a menu. Cinematic bars slide in, a full-size Cakey floats
// at the left of the screen with his lips moving word by word as his voice
// plays, and his words sit in a dialogue box beside him, revealed as he says
// them. The kid answers with a few big icon-first reply chips under the box
// (three or four at a time, "More" for the rest), and "Bye" is a dark chrome
// pill: stopping is not candy. The town stays visible behind the bars.
//
// It replaced the old tap panel: a white modal over a dimmed town with a small
// flat Cakey and nine pastel buttons. The 3D Cakey the kid had just touched
// vanished behind it, and nothing on screen moved while he spoke.
//
// Every mode the panel had is still here (trivia, the lightning round, the
// Story Oven news, dad jokes, treasure riddles, the garage, story replays,
// socks, hi); only the stage changed. The modes' state and words are the
// panel's own code, moved; the stage (below the logic) is new. All of Cakey's
// WORDS still live in @/lib/town/cakey-lines; the icons in CakeyIcons.
//
// The voice rule (command-center/characters.html) stands: a wrong trivia
// answer is "Oops! It was X. Now you know!" — about the fact, never the kid.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import GamecakesMascot, { type CakeyMood, type CakeyMouth } from '@/components/GamecakesMascot';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { pickQuestion, type TriviaQuestion } from '@/lib/trivia/questions';
import { WHATS_NEW } from '@/lib/whats-new';
import {
  HELLO_LINES,
  SOCKS_AND_SHOES_LINES,
  TRIVIA_INTRO_LINES,
  greeting,
  pickJoke,
  pickLine,
  whatsNewToCakeyLines,
  type DadJoke,
} from '@/lib/town/cakey-lines';
import { REVEAL_TICK_MS, wordsShown } from '@/lib/town/reveal-words';
import { STORY_EVENTS } from '@/lib/town/story-events';
import {
  speak as speakLine,
  stopSpeaking,
  isTalking,
  subscribeTalking,
  subscribeSpeech,
  getSpeechState,
  type SpeechState,
} from '@/lib/town/cakey-voice';
import CakeyLightningQuiz from '@/components/town/CakeyLightningQuiz';
import CakeyIcon, { type CakeyIconName } from '@/components/town/CakeyIcons';

// ---------------------------------------------------------------------------
// Lips — a mouth shape per spoken word.
//
// The voice store publishes which word is being said (for lines with a
// rendered clip). A shape is picked from the word itself: round vowels make
// an 'oh', long words a 'wide', short ones a 'small', and each word change
// flips between shapes so two long words in a row still move. Between words,
// and for lines spoken by the browser voice (no word timings), the mouth
// flaps on a timer so he never talks with a still face.
// ---------------------------------------------------------------------------

function shapeFor(word: string, flip: boolean): CakeyMouth {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 'small';
  if (/[ou]/.test(w) && w.length <= 5) return 'oh';
  if (w.length >= 6) return flip ? 'wide' : 'oh';
  return flip ? 'wide' : 'small';
}

function useCakeyLips(talking: boolean): CakeyMouth | undefined {
  const [speech, setSpeech] = useState<SpeechState>(() => getSpeechState());
  useEffect(() => subscribeSpeech(setSpeech), []);
  const [tick, setTick] = useState(0);
  // Fallback flap while talking with no word tracking: a new shape every 140ms.
  const tracked = speech.text !== null && speech.words.length > 0;
  useEffect(() => {
    if (!talking || tracked) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 140);
    return () => window.clearInterval(id);
  }, [talking, tracked]);
  if (!talking) return undefined;
  if (tracked) {
    const i = speech.wordIndex;
    if (i < 0) return 'small';
    return shapeFor(speech.words[i] ?? '', i % 2 === 0);
  }
  const cycle: CakeyMouth[] = ['small', 'wide', 'oh', 'small', 'wide', 'closed'];
  return cycle[tick % cycle.length];
}

// ---------------------------------------------------------------------------
// The dialogue text — revealed as he says it.
//
// With a rendered clip, words appear as they are spoken (the store's word
// index), the current one lit. Without one (muted, or a line with no clip),
// they appear on a reading clock instead. A tap on the box shows the whole
// line. Reading support, not decoration: text that lands as it is heard is
// how a below-grade reader keeps up with him.
// ---------------------------------------------------------------------------

function RevealText({ text, revealAll }: { text: string; revealAll: boolean }): React.ReactElement {
  const line = text.trim();
  const [speech, setSpeech] = useState<SpeechState>(() => getSpeechState());
  useEffect(() => subscribeSpeech(setSpeech), []);
  const tracked = speech.text === line && speech.words.length > 0;
  const words = tracked ? speech.words : line.split(/\s+/);
  // The parent keys this component by the line, so a new line mounts fresh and
  // the clock starts from zero without a reset here.
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClock((c) => c + 1), REVEAL_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  const shown = wordsShown({ total: words.length, revealAll, tracked, wordIndex: speech.wordIndex, clock });
  return (
    <>
      {words.map((w, i) => (
        <span
          key={`${i}-${w}`}
          className={
            i >= shown
              ? 'opacity-0'
              : tracked && i === speech.wordIndex
                ? 'rounded-[4px] bg-amber-300/70 px-[2px] dark:bg-amber-400/40'
                : undefined
          }
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// A reply chip: icon first, then a short label. Candy role per DESIGN.md's
// Layer Rule (grow for a quiz, earn for treasure, travel for a ride, white
// candy for talk), or chrome for the way out.
// ---------------------------------------------------------------------------

type ReplyRole = 'grow' | 'earn' | 'travel' | 'white' | 'chrome';
const ROLE_VARS: Record<Exclude<ReplyRole, 'chrome'>, React.CSSProperties> = {
  grow: { '--c-from': 'var(--grow-from)', '--c-to': 'var(--grow-to)', '--c-ink': 'var(--grow-ink)', '--c-glow': 'var(--grow-glow)' } as React.CSSProperties,
  earn: { '--c-from': 'var(--earn-from)', '--c-to': 'var(--earn-to)', '--c-ink': 'var(--earn-ink)', '--c-glow': 'var(--earn-glow)' } as React.CSSProperties,
  travel: { '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as React.CSSProperties,
  white: { '--c-from': '#ffffff', '--c-to': '#fff1f2', '--c-ink': '#881337', '--c-glow': 'rgba(251, 113, 133, 0.35)' } as React.CSSProperties,
};

function Reply({
  icon,
  label,
  role = 'white',
  onClick,
}: {
  icon: CakeyIconName;
  label: string;
  role?: ReplyRole;
  onClick: () => void;
}): React.ReactElement {
  if (role === 'chrome') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="chrome-focus inline-flex items-center gap-2 rounded-full border border-white/15 bg-zinc-900/85 px-4 py-2.5 font-display text-sm font-bold text-white shadow-md backdrop-blur-sm transition-[transform,background-color] duration-100 active:scale-95"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        <CakeyIcon name={icon} size={22} />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="candy-shell inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-display text-base font-bold transition-[transform,box-shadow,filter] duration-100 ease-out hover:brightness-105 active:scale-95"
      style={{ minHeight: 'var(--min-tap-target)', ...ROLE_VARS[role] }}
    >
      <CakeyIcon name={icon} size={26} />
      {label}
    </button>
  );
}

type PanelMode = 'menu' | 'trivia' | 'quiz' | 'whatsnew' | 'hi' | 'hint' | 'joke' | 'story';
type TriviaPhase = 'asking' | 'correct' | 'wrong';

export default function CakeyTalk({
  onClose,
  displayName,
  kidGrade,
  onPlayStory,
  onOpenGarage,
  treasureHints = [],
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
  treasureHints?: readonly string[];
}): React.ReactElement {
  const [mode, setMode] = useState<PanelMode>('menu');
  const talking = useSyncExternalStore(subscribeTalking, isTalking, () => false);
  const [hintLine, setHintLine] = useState('');

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
  else if (mode === 'hint') bubble = hintLine;
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

  // ---- The stage (everything above is the panel's logic, moved) ----
  const lips = useCakeyLips(talking);
  const [more, setMore] = useState(false);
  // A tap on the box shows the whole line at once. Remembered per line, so a
  // new line starts hidden again without an effect to reset it.
  const bubbleKey = typeof bubble === 'string' ? bubble : mode + String(selected) + String(phase);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const revealAll = revealedFor === bubbleKey;
  const setRevealAll = (on: boolean): void => setRevealedFor(on ? bubbleKey : null);
  const goMenu = useCallback((): void => {
    setMore(false);
    setMode('menu');
  }, []);

  // Which replies the kid can give right now.
  let replies: React.ReactNode = null;
  if (mode === 'menu' || mode === 'hi' || mode === 'hint') {
    replies = more ? (
      <>
        <Reply
          icon="lightning"
          label="Lightning round"
          role="grow"
          onClick={() => {
            speakLine('Ten quick sprinkles: five math, five words. Let’s find your just-right level!');
            setMode('quiz');
          }}
        />
        {treasureHints.length > 0 ? (
          <Reply
            icon="treasure"
            label="Treasure?"
            role="earn"
            onClick={() => {
              const next = treasureHints[(treasureHints.indexOf(hintLine) + 1) % treasureHints.length];
              setHintLine(next);
              setMode('hint');
              speakLine(next);
            }}
          />
        ) : null}
        {onOpenGarage ? <Reply icon="ride" label="A ride" role="travel" onClick={onOpenGarage} /> : null}
        {onPlayStory && STORY_EVENTS.length > 0 ? (
          <Reply icon="story" label="A story" onClick={() => setMode('story')} />
        ) : null}
        <Reply
          icon="sock"
          label="Socks?"
          onClick={() => {
            setMode('hi');
            speakLine(pickLine(SOCKS_AND_SHOES_LINES).line);
          }}
        />
        <Reply icon="back" label="Back" onClick={() => setMore(false)} />
      </>
    ) : (
      <>
        <Reply icon="quiz" label="Quiz me" role="grow" onClick={startTrivia} />
        <Reply icon="joke" label="A joke" onClick={startJoke} />
        <Reply
          icon="news"
          label="What’s new?"
          onClick={() => {
            setEntryIdx(0);
            setLineIdx(0);
            setMode('whatsnew');
          }}
        />
        <Reply
          icon="hi"
          label="Hi!"
          onClick={() => {
            setMode('hi');
            speakLine(pickLine(HELLO_LINES).line);
          }}
        />
        <Reply icon="more" label="More" onClick={() => setMore(true)} />
      </>
    );
  } else if (mode === 'trivia' && question && selected !== null) {
    replies = (
      <>
        <Reply icon="again" label="Another one!" role="grow" onClick={startTrivia} />
        <Reply icon="back" label="Back" onClick={goMenu} />
      </>
    );
  } else if (mode === 'whatsnew') {
    replies = (
      <>
        {lineIdx < newsLines.length - 1 ? (
          <Reply icon="next" label="Next" onClick={() => setLineIdx((n) => n + 1)} />
        ) : WHATS_NEW.length > 1 ? (
          <Reply
            icon="again"
            label="Another update"
            onClick={() => {
              setEntryIdx((n) => (n + 1) % WHATS_NEW.length);
              setLineIdx(0);
            }}
          />
        ) : null}
        <Reply icon="back" label="Back" onClick={goMenu} />
      </>
    );
  } else if (mode === 'joke' && joke) {
    replies = (
      <>
        {!jokeRevealed ? (
          <Reply
            icon="next"
            label="…go on"
            onClick={() => {
              setJokeRevealed(true);
              speakLine(joke.punchline);
            }}
          />
        ) : (
          <Reply icon="again" label="Another one!" onClick={startJoke} />
        )}
        <Reply icon="back" label="Back" onClick={goMenu} />
      </>
    );
  } else if (mode === 'story') {
    replies = (
      <>
        {STORY_EVENTS.map((s) => (
          <Reply key={s.slug} icon="story" label={s.title} onClick={() => onPlayStory?.(s.slug)} />
        ))}
        <Reply icon="back" label="Back" onClick={goMenu} />
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="Cakey"
      // The whole screen swallows canvas taps while he is talking; only Bye
      // (and Escape) close. A tap on the town must not walk the cupcake away
      // mid-sentence.
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes cakey-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes cakey-bars { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .cakey-float { animation: cakey-float 4s ease-in-out infinite; }
        .cakey-bar-top { animation: cakey-bars 320ms ease-out; transform-origin: top; }
        .cakey-bar-bot { animation: cakey-bars 320ms ease-out; transform-origin: bottom; }
        @media (prefers-reduced-motion: reduce) { .cakey-float, .cakey-bar-top, .cakey-bar-bot { animation: none; } }
      `}</style>

      {/* Letterbox bars. */}
      <div aria-hidden className="cakey-bar-top absolute inset-x-0 top-0 h-[7vh] bg-zinc-900" />
      <div aria-hidden className="cakey-bar-bot absolute inset-x-0 bottom-0 h-[7vh] bg-zinc-900" />
      {/* A soft lift behind the card so the words read over any land. */}
      <div aria-hidden className="absolute inset-x-0 bottom-[7vh] h-[46vh] bg-gradient-to-t from-black/40 to-transparent" />

      {/* Cakey, full size, floating at the left. */}
      <div
        className="cakey-float pointer-events-none absolute bottom-[9vh] left-[3vw] h-[min(42vh,50vw)] [&>svg]:h-full! [&>svg]:w-auto"
        style={{ filter: 'drop-shadow(0 18px 14px rgba(0,0,0,0.28))' }}
      >
        <GamecakesMascot mood={mascotMood} size={480} talking={talking} mouth={lips} aria-label="" />
      </div>

      {/* The story card: his words, then the kid's replies. Zoomed 10% so text and
          buttons read larger on a tablet; the width still fills the space beside Cakey. */}
      <div className="absolute bottom-[10vh] left-[calc(3vw+min(42vh,50vw)*0.82)] right-[3vw] max-h-[78dvh] overflow-y-auto pt-4">
        <div className="relative [zoom:1.1] rounded-3xl border-2 border-white/80 bg-gradient-to-b from-amber-50 to-rose-50 p-5 pt-6 shadow-xl shadow-rose-500/20 dark:border-white/10 dark:from-zinc-800 dark:to-zinc-900">
          <span className="absolute -top-3.5 left-5 rounded-full bg-rose-600 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] text-white shadow-md">
            Cakey
          </span>
          <button
            type="button"
            onClick={() => setRevealAll(true)}
            className="block w-full text-left font-display text-xl font-bold leading-snug text-zinc-800 dark:text-zinc-100 sm:text-2xl"
            aria-label="Show the whole line"
          >
            {typeof bubble === 'string' ? <RevealText key={bubble} text={bubble} revealAll={revealAll} /> : bubble}
          </button>

          {mode === 'trivia' && question ? (
            <div className="mt-4">
              <p className="mb-3 font-display text-lg font-bold text-zinc-800 dark:text-zinc-100">{question.q}</p>
              <div className="grid grid-cols-2 gap-2.5">
                {question.choices.map((choice, i) => {
                  const isAnswer = i === question.answer;
                  const isSelected = selected === i;
                  const isAnswered = selected !== null;
                  let cls =
                    'min-h-[var(--min-tap-target)] rounded-2xl border-2 px-4 py-3 text-left font-display text-base font-bold transition active:scale-95 disabled:cursor-default ';
                  if (!isAnswered) {
                    cls +=
                      'border-rose-200 bg-white text-zinc-800 hover:border-rose-400 hover:bg-rose-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100';
                  } else if (isAnswer) {
                    cls += 'border-emerald-400 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200';
                  } else if (isSelected) {
                    cls += 'border-rose-400 bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
                  } else {
                    cls += 'border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500';
                  }
                  return (
                    <button
                      key={i}
                      type="button"
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
            </div>
          ) : null}

          {mode === 'quiz' ? (
            <div className="mt-4">
              <CakeyLightningQuiz onBack={goMenu} />
            </div>
          ) : null}

          {replies ? <div className="mt-4 flex flex-wrap items-center gap-2">{replies}</div> : null}
        </div>

        {/* Bye: the one dark pill, under the card, never candy. */}
        <div className="mt-3 flex justify-end">
          <Reply icon="bye" label="Bye, Cakey" role="chrome" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
