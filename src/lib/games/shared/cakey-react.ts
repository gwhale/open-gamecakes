// Cakey reacting to a kid answering questions, across every game.
//
// ChallengeInput is the one component that poses and grades questions for most
// games, but every host unmounts it the instant an answer comes in — so
// anything drawn inside the question dialog vanishes before the kid sees it.
// Instead ChallengeInput emits small events here, and <CakeyReactions/>
// (mounted once per layout, outside any game) turns them into a short-lived
// Cakey in the corner that outlives the dialog.
//
// The decisions, made with the product owner on 2026-10-16:
//   * Hesitation: no input for THINK_AFTER_MS while a question is open → Think.
//   * Wrong: Oops on the FIRST wrong answer in a row only. Each question is a
//     single try in these games, so "first wrong per question" became "first
//     wrong in a streak" — Cakey never nags a kid who is already struggling.
//   * Right: a short celebrate, which also resets the wrong streak.

export const THINK_AFTER_MS = 10_000;

export type CakeyEvent =
  | { type: 'question-open' }
  | { type: 'activity' }
  | { type: 'answered'; correct: boolean }
  | { type: 'question-close' };

type Listener = (event: CakeyEvent) => void;
const listeners = new Set<Listener>();
// How many questions are open right now. A question can open before the
// listener subscribes — React runs a page's effects before a layout sibling's
// on the same commit — so a late subscriber is told at once instead of
// missing the hesitation clock for that whole question.
let openQuestions = 0;

export function emitCakeyEvent(event: CakeyEvent): void {
  if (event.type === 'question-open') openQuestions++;
  if (event.type === 'question-close') openQuestions = Math.max(0, openQuestions - 1);
  for (const listener of listeners) listener(event);
}

export function subscribeCakeyEvents(listener: Listener): () => void {
  listeners.add(listener);
  if (openQuestions > 0) listener({ type: 'question-open' });
  return () => {
    listeners.delete(listener);
  };
}

/** What Cakey shows for an answer, and the wrong-streak that follows it. */
export function reactToAnswer(
  correct: boolean,
  wrongStreak: number,
): { show: 'celebrate' | 'oops' | null; wrongStreak: number } {
  if (correct) return { show: 'celebrate', wrongStreak: 0 };
  const next = wrongStreak + 1;
  return { show: next === 1 ? 'oops' : null, wrongStreak: next };
}

// ---- One Cakey on screen ----------------------------------------------------
// The question card draws its own Cakey beside it on wide screens (see
// QuestionCakey in ChallengeInput). While that one is on screen he shows the
// reactions himself and the corner Cakey stays hidden, so a kid never sees two.
// CakeyReactions still runs the rules above and publishes what to show here;
// when the dialog closes on an answer the side Cakey unmounts, and the corner
// one picks the reaction up, as before.

export type CakeyReaction = 'think' | 'oops' | 'celebrate';

export const REACTION_LINES: Record<CakeyReaction, string> = {
  think: 'Take your time!',
  oops: 'Oops! You’ll get the next one.',
  celebrate: 'Yes!',
};

let reaction: CakeyReaction | null = null;
let sideCakeys = 0;
const viewListeners = new Set<() => void>();
const notifyView = () => {
  for (const fn of viewListeners) fn();
};

export function publishReaction(next: CakeyReaction | null): void {
  if (reaction === next) return;
  reaction = next;
  notifyView();
}

export function getReaction(): CakeyReaction | null {
  return reaction;
}

/** Call while a side Cakey is actually drawn; returns the unregister. */
export function registerSideCakey(): () => void {
  sideCakeys += 1;
  notifyView();
  return () => {
    sideCakeys = Math.max(0, sideCakeys - 1);
    notifyView();
  };
}

export function hasSideCakey(): boolean {
  return sideCakeys > 0;
}

export function subscribeCakeyView(fn: () => void): () => void {
  viewListeners.add(fn);
  return () => {
    viewListeners.delete(fn);
  };
}
