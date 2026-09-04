// Where does a game's "back" button send the kid?
//
// Games are reachable two ways:
//   1. Walking the 3D city (/town) to a game's building.
//   2. The flat All Games menu (/games), which links to each game with
//      a `?from=games` query param.
//
// By default every game's back button points at /town. But a kid who
// arrived from the All Games menu expects "back" to return them to that
// menu — not dump them into the city they were avoiding. This resolver
// is the single place that decides that, shared by GameLauncher (the
// pre-game screen) and PhaserGameHost (in-play + game-over chrome).

export interface BackTarget {
  /** Route the back link/button navigates to. */
  href: string;
  /** Visible label, e.g. '← All Games'. */
  label: string;
}

/** Sentinel value the All Games menu appends as `?from=…` so games know
 *  the kid came from the flat menu rather than the city. */
export const FROM_GAMES_MENU = 'games';

/**
 * Decide whether a game's back button should be overridden based on where
 * the kid came from (the `from` query param on the game's URL).
 *
 * Return a {@link BackTarget} to OVERRIDE the caller's default back button,
 * or `null` to leave the caller's own default in place (back to /town).
 *
 * @param from  The `from` query param value, or null if absent.
 *
 * The games menu is the only special case today. If a future surface (a
 * "favorites" strip, a deep link, etc.) wants its own return target, add a
 * branch here — keeping every "where does back go?" decision in one place.
 */
export function resolveGameBackTarget(from: string | null): BackTarget | null {
  if (from === FROM_GAMES_MENU) {
    return { href: '/games', label: '← All Games' };
  }
  return null;
}
