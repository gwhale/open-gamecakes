// Cake Shift — which rung of the colour ladder each layer wears.
//
// WORLD.CAKE_TIERS is an eight-step value ramp, light to dark. A tower with
// fewer than eight layers must still read light-on-top, dark-underneath, AND
// every adjacent pair must be tellable apart at a glance — which a naive
// "size 1 → rung 1, size 2 → rung 2" does not give: gold next to amber is two
// yellows. So each layer count samples its own subset of the ladder, always
// monotonic, always cream on top, and at three layers exactly the brand cake
// (cream / gold / strawberry). Pure; tested.

import { WORLD } from '@/lib/games/theme/palette';
import { MAX_LAYERS, MIN_LAYERS } from './state';

/** Ladder rungs (0-based into CAKE_TIERS) by layer count, size 1 → n. */
const RUNGS: Record<number, readonly number[]> = {
  3: [0, 1, 3],
  4: [0, 1, 3, 7],
  5: [0, 1, 3, 5, 7],
  6: [0, 1, 2, 3, 5, 7],
  7: [0, 1, 2, 3, 4, 6, 7],
  8: [0, 1, 2, 3, 4, 5, 6, 7],
};

/** Hex colours for sizes 1..n of an n-layer tower. */
export function tierColorsFor(n: number): readonly number[] {
  const layers = Math.max(MIN_LAYERS, Math.min(MAX_LAYERS, Math.floor(n)));
  return RUNGS[layers].map((i) => WORLD.CAKE_TIERS[i]);
}
