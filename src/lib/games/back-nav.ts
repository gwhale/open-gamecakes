// Where does a game's "back" button send the kid?
//
// Games are reachable three ways:
//   1. Walking the 3D city (/town) to a game's building.
//   2. The flat All Games menu (/games), which links to each game with
//      a `?from=games` query param.
//   3. The PUBLIC ARCADE at /play, with no account at all.
//
// The arcade is why this file grew a `pathname` argument. It arrived after
// this module was written and did not add a branch here; instead it passed
// backHref/backLabel props, which ONLY PhaserGameHost reads -- every 3D host
// resolves its back target here and nowhere else. So five arcade games exited
// to /play and eleven dumped a signed-out stranger into /town, the town they
// do not have an account for.
//
// It keys off the PATHNAME rather than a `?from=play` param on purpose: an
// arcade URL gets shared, and a game opened directly from a link must exit
// somewhere sensible too. The path is the one thing a shared link keeps.
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

/** Route prefix of the public arcade. A game under here belongs to /play
 *  however the visitor arrived at it. */
export const PLAY_PREFIX = '/play/';

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
export function resolveGameBackTarget(
  from: string | null,
  pathname?: string | null,
): BackTarget | null {
  // The arcade wins over ?from=. A visitor physically on /play/<slug> is in
  // the arcade whatever a stale query param inherited from a copied link says,
  // and /games is not somewhere a signed-out stranger can go.
  if (pathname?.startsWith(PLAY_PREFIX)) {
    return { href: '/play', label: '← All games' };
  }
  if (from === FROM_GAMES_MENU) {
    return { href: '/games', label: '← All Games' };
  }
  return null;
}
