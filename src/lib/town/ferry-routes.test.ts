// Ferry route geometry, checked the way the engine derives it.
//
// The engine builds one Cakey Ferry per island with `transport: 'ferry'`, and
// computes every dock, boarding point and crossing from the solved beans — the
// same numbers as the solver, so the routes cannot be unit-tested from a
// rendered scene but CAN be re-derived here from the same inputs. This mirrors
// computeFerryLayout in engine.ts (DOCK_OUT / BOARD_IN / the +90px bow on the
// bezier); if those constants move, move them here too.
//
// What would break silently without this: a third island placed in another
// boat's path, two docks close enough that the near-dock scan is ambiguous, or
// a dock that ends up on sand instead of in the water.

import { describe, expect, it } from 'vitest';
import { allIslands, ferryIslands, type SolvedIsland } from './islands';
import { beanNd } from './three/bean';

const DOCK_OUT = 70;
const BOARD_IN = 80;
/** The engine's sea gate: below this nd the avatar can wade. A crossing must
 *  keep every OTHER island further out than this, or the boat sails through a
 *  beach. */
const WADE_ND = 1.15;
/** The near-dock scan radius in the engine. Two boarding points closer than
 *  twice this could both claim the kid. */
const FERRY_BOARD_R_PX = 120;

type Pt = { x: number; y: number };
const nd = (b: SolvedIsland, p: Pt): number =>
  beanNd(b.center.x, b.center.y, b.halfW, b.halfH, b.pad, b.stretch, p.x, p.y);

function shoreR(bean: SolvedIsland, dirx: number, diry: number): number {
  let lo = 0;
  let hi = 12000;
  for (let it = 0; it < 24; it += 1) {
    const mid = (lo + hi) / 2;
    if (nd(bean, { x: bean.center.x + dirx * mid, y: bean.center.y + diry * mid }) < 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

function layout(main: SolvedIsland, isle: SolvedIsland) {
  const dx = isle.center.x - main.center.x;
  const dy = isle.center.y - main.center.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mainShoreR = shoreR(main, ux, uy);
  const isleShoreR = shoreR(isle, -ux, -uy);
  const mainShore = { x: main.center.x + ux * mainShoreR, y: main.center.y + uy * mainShoreR };
  const isleShore = { x: isle.center.x - ux * isleShoreR, y: isle.center.y - uy * isleShoreR };
  return {
    mainlandDockPx: { x: mainShore.x + ux * DOCK_OUT, y: mainShore.y + uy * DOCK_OUT },
    islandDockPx: { x: isleShore.x - ux * DOCK_OUT, y: isleShore.y - uy * DOCK_OUT },
    mainlandBoardPx: { x: mainShore.x - ux * BOARD_IN, y: mainShore.y - uy * BOARD_IN },
    arrivePx: { x: isle.center.x, y: isle.center.y },
  };
}

/** The boat's path: ferry.ts's quadratic bezier, bowed +90px in x. */
function bezier(from: Pt, to: Pt, t: number): Pt {
  const ctrl = { x: (from.x + to.x) / 2 + 90, y: (from.y + to.y) / 2 };
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
  };
}

const solved = allIslands();
const main = solved[0];
const lines = ferryIslands().map((isle) => ({ isle, L: layout(main, isle) }));

describe('ferry routes', () => {
  it('serves at least Chess and Puzzle', () => {
    expect(lines.map((l) => l.isle.id)).toEqual(expect.arrayContaining(['chess-isle', 'puzzle-isle']));
  });

  it('boards on solid mainland and arrives on the island, well inland', () => {
    for (const { isle, L } of lines) {
      expect(nd(main, L.mainlandBoardPx), `${isle.id} board point`).toBeLessThan(1);
      expect(nd(isle, L.arrivePx), `${isle.id} arrive point`).toBeLessThan(0.82);
    }
  });

  it('moors both docks in open water, off every island', () => {
    for (const { isle, L } of lines) {
      for (const b of solved) {
        expect(nd(b, L.mainlandDockPx), `${isle.id} mainland dock vs ${b.id}`).toBeGreaterThan(1);
        expect(nd(b, L.islandDockPx), `${isle.id} island dock vs ${b.id}`).toBeGreaterThan(1);
      }
    }
  });

  it('sails clear of every island that is not one of its two stops', () => {
    for (const { isle, L } of lines) {
      for (const b of solved) {
        if (b.id === main.id || b.id === isle.id) continue;
        for (let i = 0; i <= 32; i += 1) {
          const p = bezier(L.mainlandDockPx, L.islandDockPx, i / 32);
          expect(nd(b, p), `${isle.id} crossing passes ${b.id} at t=${i / 32}`).toBeGreaterThan(WADE_ND);
        }
      }
      // And stays in the water between its own two shores.
      for (let i = 4; i <= 28; i += 1) {
        const p = bezier(L.mainlandDockPx, L.islandDockPx, i / 32);
        expect(nd(main, p), `${isle.id} crossing grounds on the mainland at t=${i / 32}`).toBeGreaterThan(1);
        expect(nd(isle, p), `${isle.id} crossing grounds on itself at t=${i / 32}`).toBeGreaterThan(1);
      }
    }
  });

  it('keeps every boarding point far enough apart that the near-dock scan is never ambiguous', () => {
    const pts = lines.flatMap(({ isle, L }) => [
      { id: `${isle.id} mainland`, p: L.mainlandBoardPx },
      { id: `${isle.id} island`, p: L.arrivePx },
    ]);
    for (let a = 0; a < pts.length; a += 1) {
      for (let b = a + 1; b < pts.length; b += 1) {
        const d = Math.hypot(pts[a].p.x - pts[b].p.x, pts[a].p.y - pts[b].p.y);
        expect(d, `${pts[a].id} vs ${pts[b].id}`).toBeGreaterThan(2 * FERRY_BOARD_R_PX);
      }
    }
  });
});
