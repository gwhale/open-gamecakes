// Where a dive starts.
//
// Pulled out as a pure function so the rule can be tested, because it is a rule
// about FEEL rather than about data, and it is the kind of thing that gets
// quietly "simplified" into always-resume by someone reading §11 of the PRD and
// nothing else.
//
// The rule mirrors the walkable town's pickSpawn(): resume only if the save is
// fresh. A save from the last half hour means the kid stepped out and came
// straight back — surfaced to check something, tabbed away, went to a game —
// and dropping them at the reef would strand them. Anything older is a new
// dive, and a new dive starts at the reef on purpose.
//
// WHY NOT ALWAYS RESUME. The descent is the best thirty seconds in the feature:
// bright shallow water, coral, the floor falling away, the blue going dark, the
// headlights coming on by themselves. A kid who parked deep in the canyon
// and always resumed there would never see it again. The ocean remembering
// WHAT YOU FOUND and HOW DEEP YOU GOT is the part that matters; remembering
// exactly where you were floating is worth much less and costs the best beat.

import { REEF_SPAWN, RESUME_WINDOW_MS, type DeepSpawn } from './types';

export interface SavedDeepState {
  x: number;
  y: number;
  z: number;
  heading: number;
  updated_at: string;
}

/**
 * Pick the pose a dive should start from.
 *
 * `now` is injectable so the test does not depend on the wall clock.
 */
export function pickDeepSpawn(
  saved: SavedDeepState | null | undefined,
  now: number = Date.now(),
): DeepSpawn {
  if (!saved) return { ...REEF_SPAWN };

  const savedMs = Date.parse(saved.updated_at);
  // An unparseable timestamp is not a reason to strand anyone somewhere odd —
  // treat it as a stale row and start fresh.
  if (!Number.isFinite(savedMs)) return { ...REEF_SPAWN };
  if (now - savedMs > RESUME_WINDOW_MS) return { ...REEF_SPAWN };

  // A clock that has gone backwards (device time changed, DST, a row written by
  // a machine running fast) reads as a save from the future. Resume rather than
  // reset: the row is almost certainly this kid's own, from moments ago.
  const { x, y, z, heading } = saved;
  if (![x, y, z, heading].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ...REEF_SPAWN };
  }
  return { x, y, z, heading };
}
