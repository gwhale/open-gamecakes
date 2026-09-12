// Chosen play length for the current game launch.
//
// Every game now offers a 1 / 2 / 3-minute picker on its launcher, and the
// pick does two things: it sizes the game's countdown clock, and it scales
// the cookie drip (1 min = 1 cookie, 2 = 2, 3 = 3 — see lib/tokens/mint).
//
// We stash the choice in a module-level singleton rather than threading a
// prop through all thirteen game shells + five bespoke 3D engines. Launcher
// and game live in the same SPA page (the shell swaps components via state,
// no navigation), so a plain module variable survives the launcher → game
// hand-off. GameLauncher sets it on "Play"; each host reads it for its clock
// and its /api/attempts POST. A full reload resets it to the default, which
// is fine — the kid always passes back through the launcher, which re-sets it.

export const DURATION_CHOICES = [1, 2, 3] as const;
export type DurationMin = (typeof DURATION_CHOICES)[number];

/** Default when nothing's been picked yet (direct load, tests). Middle of
 *  the road so an unset value is never punishing or trivially farmable. */
export const DEFAULT_DURATION_MIN: DurationMin = 2;

let current: DurationMin = DEFAULT_DURATION_MIN;

/** Clamp any incoming number to a valid 1/2/3 choice. */
export function clampDuration(min: number): DurationMin {
  if (min <= 1) return 1;
  if (min >= 3) return 3;
  return 2;
}

/** Record the kid's pick (called from GameLauncher's Play handler). */
export function setSessionDuration(min: DurationMin): void {
  current = min;
}

/** The current session's chosen length in minutes (1/2/3). */
export function getSessionDuration(): DurationMin {
  return current;
}

/** Convenience: chosen length in milliseconds, for engine round clocks. */
export function getSessionDurationMs(): number {
  return current * 60_000;
}
