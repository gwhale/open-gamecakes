// Shared types + helpers for Phaser-based games.
//
// Every Phaser scene communicates with its React host through a stable
// event contract. The scene is the source of truth for game state; React
// is responsible for the challenge modal UI (shared across all games) and
// the /api/attempts POST that feeds the mastery + evidence engines.

import type { Challenge } from '@/lib/games/shared/challenge';

/** Body shape that /api/attempts expects. Matches the existing SVG games
 *  so the server/mastery/evidence pipeline is unchanged. */
export interface SessionSummary {
  taps_total: number;
  taps_wrong: number;
  /** The "optimal" denominator for efficiency — session-template defined.
   *  For Flappy, this is the number of pipes passed. */
  optimal_taps: number;
  /** 0..1 — game template-defined correctness scalar. The mastery engine
   *  treats efficiency >= 0.7 as a "correct" attempt. */
  efficiency: number;
  completed: boolean;
  session_ms: number;
  /** Optional extra summary lines shown in the end-of-round modal under
   *  the standard "X right · Y wrong · Z%" line. Each entry is a short
   *  pre-formatted string with emoji + value, e.g. "🎈 12 hits". Games
   *  without per-game stats leave this undefined. */
  meta_lines?: string[];
}

/** What a Phaser scene emits on its internal event emitter. The host
 *  listens for these and bridges them to React UI / API calls. */
export interface SceneEventMap {
  /** Scene wants the React modal to pose a challenge — numeric (math
   *  keypad) or choice (reading button stack), decided by challenge.kind. */
  'challenge:open': { challenge: Challenge; reason: string };
  /** Scene reports session has ended (win or loss). */
  'session:end': { summary: SessionSummary };
  /** Scene wants React to play a sound from the shared sound library.
   *  Name is one of the exported sound helpers in
   *  `src/lib/games/shared/sounds.ts`. */
  'scene:sfx': { name: SoundName };
}

/** What the React host sends INTO the scene after the modal closes. */
export interface HostEventMap {
  /** Kid answered the challenge. `correct` true/false. */
  'challenge:result': { correct: boolean };
  /** Parent/kid tapped the reset button in the game-over overlay. */
  'scene:reset': Record<string, never>;
  /** The host's session clock hit zero — end the round now with whatever
   *  score the kid has. Each scene wires this to its own endSession(). */
  'scene:timeUp': Record<string, never>;
}

export type SoundName =
  | 'tap'
  | 'catch'
  | 'escape'
  | 'hop'
  | 'tick'
  | 'padPress'
  | 'timeUp'
  | 'win'
  | 'correct'
  | 'wrong'
  | 'bubble'
  | 'swoop'
  | 'levelUp'
  | 'start';

/** Compute a session summary from score + wrong-answer counts. Pure. */
export function buildSessionSummary(args: {
  score: number;
  wrongAnswers: number;
  sessionStart: number;
  completed?: boolean;
  /** Optional override for the optimal_taps denominator (default = score). */
  optimalTaps?: number;
  /** Optional pre-formatted summary lines for the end-of-round modal. */
  metaLines?: string[];
}): SessionSummary {
  const { score, wrongAnswers, sessionStart } = args;
  const total = score + wrongAnswers;
  return {
    taps_total: total,
    taps_wrong: wrongAnswers,
    optimal_taps: args.optimalTaps ?? score,
    efficiency: total > 0 ? score / total : 0,
    completed: args.completed ?? true,
    session_ms: Date.now() - sessionStart,
    meta_lines: args.metaLines,
  };
}
