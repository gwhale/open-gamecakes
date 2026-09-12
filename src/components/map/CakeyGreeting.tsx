'use client';

import { useState } from 'react';
import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import { pickQuestion, type TriviaQuestion } from '@/lib/trivia/questions';

type TriviaPhase = 'greeting' | 'asking' | 'correct' | 'wrong';

interface CakeyGreetingProps {
  displayName: string;
  /** Kid's grade level for trivia calibration: 0=K, 1=1st, ..., 6=6th.
   *  Null falls back to a mid-range default (~2nd grade) so unknown-grade
   *  kids still get reasonable variety. */
  kidGrade: number | null;
}

export default function CakeyGreeting({ displayName, kidGrade }: CakeyGreetingProps) {
  const [phase, setPhase] = useState<TriviaPhase>('greeting');
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const [lastIndex, setLastIndex] = useState(-1);
  const [selected, setSelected] = useState<number | null>(null);

  function startTrivia() {
    const { question: q, index } = pickQuestion(kidGrade, lastIndex);
    setQuestion(q);
    setLastIndex(index);
    setPhase('asking');
    setSelected(null);
  }

  function choose(i: number) {
    if (selected !== null || !question) return;
    setSelected(i);
    setPhase(i === question.answer ? 'correct' : 'wrong');
  }

  function next() {
    startTrivia();
  }

  function dismiss() {
    setPhase('greeting');
    setQuestion(null);
    setSelected(null);
  }

  const mood: CakeyMood =
    phase === 'correct' ? 'celebrate' :
    phase === 'asking'  ? 'happy' :
    phase === 'wrong'   ? 'idle' :
    'wave';

  return (
    <section className="flex flex-col items-center gap-3 px-4 pt-2" aria-label="Cakey">
      {/* Cakey + speech bubble */}
      <div className="flex items-end justify-center gap-3 sm:gap-4">
        <GamecakesMascot mood={mood} size={96} />
        <div className="relative max-w-[240px] rounded-3xl rounded-bl-md bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-md dark:bg-zinc-800 dark:text-zinc-100 sm:text-base">
          {phase === 'greeting' && (
            <>Hi {displayName}! I&rsquo;m Cakey. Where to today?</>
          )}
          {phase === 'asking' && (
            <>Here&rsquo;s a fun one! 🎉</>
          )}
          {phase === 'correct' && (
            <>{question!.funFact}</>
          )}
          {phase === 'wrong' && (
            <>Oops! It was <strong>{question!.choices[question!.answer]}</strong>. Now you know! 🍰</>
          )}
          {/* Speech bubble tail */}
          <span
            className="absolute -bottom-2 left-4 h-0 w-0 border-b-0 border-l-8 border-r-0 border-t-8 border-transparent border-t-white dark:border-t-zinc-800"
            aria-hidden
          />
        </div>
      </div>

      {/* Trivia launcher (greeting state) */}
      {phase === 'greeting' && (
        <button
          onClick={startTrivia}
          className="rounded-full bg-amber-100 px-5 py-2 text-sm font-bold text-amber-800 shadow-sm transition hover:bg-amber-200 active:scale-95 dark:bg-amber-900/40 dark:text-amber-200"
        >
          ✨ Quick trivia with Cakey!
        </button>
      )}

      {/* Trivia panel */}
      {phase !== 'greeting' && question && (
        <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-lg dark:bg-zinc-800">
          {/* Question */}
          <p className="mb-4 text-center text-base font-bold text-zinc-800 dark:text-zinc-100">
            {question.q}
          </p>

          {/* Choice grid */}
          <div className="grid grid-cols-2 gap-3">
            {question.choices.map((choice, i) => {
              const isAnswer   = i === question.answer;
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
                cls +=
                  'border-rose-400 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200';
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

          {/* Post-answer actions */}
          {selected !== null && (
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={next}
                className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-500 active:scale-95"
              >
                🎲 Another one!
              </button>
              <button
                onClick={dismiss}
                className="rounded-full bg-zinc-200 px-5 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
