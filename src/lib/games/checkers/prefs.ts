// The kid's checkers preferences — which piece set, and which side they play.
//
// localStorage, mirroring lib/games/shared/sounds.ts (the only other lib-level
// localStorage in this codebase). Three reasons it does not go in the database:
// it is a cosmetic per-device choice, it needs no round trip before the board
// can be built, and — the load-bearing one — GUESTS HAVE NO kids ROW, so a
// column would silently drop the choice of anyone playing without logging in.
//
// If this should ever follow a kid across devices, the shape here is already the
// right one: add a kids.checkers_prefs jsonb mirroring kids.cupcake_config and
// swap the loader. Nothing else changes.

import { DEFAULT_STYLE_ID, PIECE_STYLES } from './styles';
import type { Side } from './rules';

const STORAGE_KEY = 'gamecakes.checkers.prefs';

export interface CheckersPrefs {
  styleId: string;
  side: Side;
}

/** Dark moves first in American checkers, so this is the side that opens. A kid
 *  who picks the other one watches the bot move first — see the engine. */
export const DEFAULT_PREFS: CheckersPrefs = { styleId: DEFAULT_STYLE_ID, side: 'dark' };

/** Always validated against the live catalog. A saved styleId from a set that
 *  was later renamed or removed must fall back, not crash the board. */
function coerce(raw: unknown): CheckersPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
  const o = raw as Partial<CheckersPrefs>;
  const styleId = PIECE_STYLES.some((s) => s.id === o.styleId) ? o.styleId! : DEFAULT_PREFS.styleId;
  const side: Side = o.side === 'light' || o.side === 'dark' ? o.side : DEFAULT_PREFS.side;
  return { styleId, side };
}

export function getCheckersPrefs(): CheckersPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return coerce(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setCheckersPrefs(prefs: CheckersPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(coerce(prefs)));
  } catch {
    // Private browsing, quota, whatever — a cosmetic preference is never worth
    // an error a kid can see.
  }
}
