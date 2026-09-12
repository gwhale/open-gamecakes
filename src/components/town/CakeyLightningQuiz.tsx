'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { speak as speakLine } from '@/lib/town/cakey-voice';
import type { PublicQuizQuestion } from '@/lib/cakey-quiz/core';

interface StartResponse {
  sessionId: string;
  question: PublicQuizQuestion;
  questionNumber: number;
  totalQuestions: number;
  adjustmentEligible: boolean;
  nextAdjustmentAt: string | null;
  resumed: boolean;
  guest: boolean;
  error?: string;
}

interface Result {
  mathScore: number;
  readingScore: number;
  startingMathTier: number;
  startingReadingTier: number;
  mathTier: number;
  readingTier: number;
  adjustmentApplied: boolean;
  guest: boolean;
}

interface AnswerResponse {
  correct: boolean;
  correctAnswer: string;
  complete: boolean;
  nextQuestion?: PublicQuizQuestion;
  questionNumber?: number;
  totalQuestions?: number;
  mathScore?: number;
  readingScore?: number;
  startingMathTier?: number;
  startingReadingTier?: number;
  mathTier?: number;
  readingTier?: number;
  adjustmentApplied?: boolean;
  guest?: boolean;
  error?: string;
}

export default function CakeyLightningQuiz({
  onBack,
}: {
  onBack: () => void;
}): React.ReactElement {
  const startedRef = useRef(false);
  const [sessionId, setSessionId] = useState('');
  const [question, setQuestion] = useState<PublicQuizQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [adjustmentEligible, setAdjustmentEligible] = useState(false);
  const [nextAdjustmentAt, setNextAdjustmentAt] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    correctAnswer: string;
    nextQuestion?: PublicQuizQuestion;
    nextNumber?: number;
    result?: Result;
  } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await fetch('/api/cakey-quiz/start', { method: 'POST' });
      const data = (await res.json()) as StartResponse;
      if (!res.ok) throw new Error(data.error ?? 'Quiz could not start.');
      setSessionId(data.sessionId);
      setQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setTotalQuestions(data.totalQuestions);
      setAdjustmentEligible(data.adjustmentEligible);
      setNextAdjustmentAt(data.nextAdjustmentAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz could not start.');
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, [start]);

  const submit = useCallback(
    async (value: string): Promise<void> => {
      if (!question || !sessionId || submitting || feedback || !value.trim()) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/cakey-quiz/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, questionId: question.id, response: value.trim() }),
        });
        const data = (await res.json()) as AnswerResponse;
        if (!res.ok) throw new Error(data.error ?? 'That answer did not save.');

        const finalResult =
          data.complete &&
          data.mathScore != null &&
          data.readingScore != null &&
          data.startingMathTier != null &&
          data.startingReadingTier != null &&
          data.mathTier != null &&
          data.readingTier != null
            ? {
                mathScore: data.mathScore,
                readingScore: data.readingScore,
                startingMathTier: data.startingMathTier,
                startingReadingTier: data.startingReadingTier,
                mathTier: data.mathTier,
                readingTier: data.readingTier,
                adjustmentApplied: Boolean(data.adjustmentApplied),
                guest: Boolean(data.guest),
              }
            : undefined;

        setFeedback({
          correct: data.correct,
          correctAnswer: data.correctAnswer,
          nextQuestion: data.nextQuestion,
          nextNumber: data.questionNumber,
          result: finalResult,
        });
        speakLine(
          data.correct
            ? 'Sprinkle perfect! You got it.'
            : `Good try. The answer is ${data.correctAnswer}.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That answer did not save.');
      } finally {
        setSubmitting(false);
      }
    },
    [feedback, question, sessionId, submitting],
  );

  const advance = (): void => {
    if (!feedback) return;
    if (feedback.result) {
      setResult(feedback.result);
      setFeedback(null);
      return;
    }
    if (feedback.nextQuestion && feedback.nextNumber) {
      setQuestion(feedback.nextQuestion);
      setQuestionNumber(feedback.nextNumber);
      setResponse('');
      setFeedback(null);
    }
  };

  if (error && !question) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <p className="font-bold text-rose-800 dark:text-rose-200">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => void start()} className="rounded-full bg-rose-500 px-5 py-2.5 font-bold text-white">
            Try again
          </button>
          <button type="button" onClick={onBack} className="rounded-full bg-white px-5 py-2.5 font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-100">
            Back
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="text-center">
        <div className="mb-3 text-4xl" aria-hidden>⚡🍰⚡</div>
        <h3 className="font-display text-xl font-black text-zinc-900 dark:text-white">Lightning round complete!</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ScoreCard label="Math" emoji="➕" score={result.mathScore} before={result.startingMathTier} after={result.mathTier} />
          <ScoreCard label="Words" emoji="📚" score={result.readingScore} before={result.startingReadingTier} after={result.readingTier} />
        </div>
        <p className="mt-4 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
          {result.guest
            ? 'Guest quizzes are practice only.'
            : result.adjustmentApplied
              ? 'Cakey tuned your starting levels for the games ahead.'
              : adjustmentEligible
                ? 'Your levels were already right on target.'
                : 'Practice scored! Your next level check opens after the weekly reset.'}
        </p>
        <button type="button" onClick={onBack} className="mt-5 w-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400 px-5 py-3 font-black text-white shadow-md active:scale-95">
          Back to Cakey
        </button>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-rose-400" aria-hidden />
        <p className="font-bold text-zinc-700 dark:text-zinc-200">Cakey is mixing the questions…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
          question.subject === 'math'
            ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
            : 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200'
        }`}>
          {question.subject === 'math' ? '➕ Math' : '📚 Words'}
        </span>
        <span className="text-xs font-black tabular-nums text-zinc-500">
          {questionNumber} / {totalQuestions}
        </span>
      </div>

      <div className="mb-5 flex justify-center gap-1.5" aria-label={`Question ${questionNumber} of ${totalQuestions}`}>
        {Array.from({ length: totalQuestions }, (_, index) => (
          <span
            key={index}
            className={`h-2.5 flex-1 rounded-full transition ${
              index < questionNumber - 1
                ? index % 2 === 0 ? 'bg-sky-400' : 'bg-violet-400'
                : index === questionNumber - 1
                  ? 'animate-pulse bg-amber-400'
                  : 'bg-zinc-200 dark:bg-zinc-600'
            }`}
          />
        ))}
      </div>

      <div className="rounded-[1.75rem] border-2 border-amber-200 bg-amber-50/80 p-4 text-center shadow-inner dark:border-amber-900/60 dark:bg-amber-950/20">
        <button
          type="button"
          onClick={() => speakLine([question.prompt, question.subtext].filter(Boolean).join('. '))}
          className="float-right ml-2 rounded-full bg-white p-2 text-sm shadow-sm active:scale-95 dark:bg-zinc-700"
          aria-label="Read the question to me"
        >
          🔊
        </button>
        <p className="font-display text-lg font-black leading-snug text-zinc-900 dark:text-white">{question.prompt}</p>
        {question.subtext ? <p className="mt-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300">{question.subtext}</p> : null}
      </div>

      {feedback ? (
        <div className={`mt-4 rounded-2xl border-2 p-4 text-center ${
          feedback.correct
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
            : 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'
        }`}>
          <p className="font-black text-zinc-900 dark:text-white">
            {feedback.correct ? 'Sprinkle perfect!' : `The answer is ${feedback.correctAnswer}.`}
          </p>
          <button type="button" onClick={advance} className="mt-3 rounded-full bg-zinc-900 px-6 py-2.5 font-bold text-white active:scale-95 dark:bg-white dark:text-zinc-900">
            {feedback.result ? 'See my results' : 'Next sprinkle'}
          </button>
        </div>
      ) : question.kind === 'choice' ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {(question.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={submitting}
              onClick={() => void submit(choice)}
              className="min-h-14 rounded-2xl border-2 border-violet-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 active:scale-95 disabled:opacity-50 dark:border-violet-800 dark:bg-zinc-700 dark:text-white"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(response);
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            value={response}
            onChange={(event) => setResponse(event.target.value.replace(/[^0-9-]/g, '').slice(0, 4))}
            className="min-w-0 flex-1 rounded-2xl border-2 border-sky-200 bg-white px-4 py-3 text-center font-display text-2xl font-black text-zinc-900 outline-none focus:border-sky-500 dark:border-sky-800 dark:bg-zinc-700 dark:text-white"
            aria-label="Your answer"
          />
          <button
            type="submit"
            disabled={submitting || !response.trim()}
            className="rounded-2xl bg-sky-500 px-5 py-3 font-black text-white shadow-sm active:scale-95 disabled:opacity-40"
          >
            Check
          </button>
        </form>
      )}

      {error ? <p role="alert" className="mt-3 text-center text-sm font-bold text-rose-600">{error}</p> : null}
      {!feedback && nextAdjustmentAt && !adjustmentEligible ? (
        <p className="mt-3 text-center text-[11px] font-semibold text-zinc-500">
          Practice round. Your next level check opens {new Date(nextAdjustmentAt).toLocaleDateString()}.
        </p>
      ) : null}
    </div>
  );
}

function ScoreCard({
  label,
  emoji,
  score,
  before,
  after,
}: {
  label: string;
  emoji: string;
  score: number;
  before: number;
  after: number;
}): React.ReactElement {
  return (
    <div className="rounded-3xl border-2 border-white bg-gradient-to-b from-white to-amber-50 p-4 shadow-sm dark:border-zinc-600 dark:from-zinc-700 dark:to-zinc-800">
      <div className="text-2xl" aria-hidden>{emoji}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-black text-zinc-900 dark:text-white">{score}/5</div>
      <div className="mt-1 text-xs font-bold text-zinc-500">
        Level {before === after ? after : `${before} → ${after}`}
      </div>
    </div>
  );
}
