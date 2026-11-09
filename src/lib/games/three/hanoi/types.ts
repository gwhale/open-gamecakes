// Cake Shift — engine contract.
//
// Tower of Hanoi on three cake stands, rendered in raw three.js. The engine
// owns the scene, the animation and the tap/drag input; the React host owns
// the HUD (moves, par meter, hint budget, Cakey's lines) and the attempts
// POST. State crosses the boundary through the callbacks below and the pure
// model in src/lib/games/hanoi/state.ts — the engine never renders text.
//
// Bundle hygiene, same rule as every other 3D game here: NO runtime `three`
// import in this module. `import type` only; the loaded namespace arrives as
// an engine argument.

import type * as THREE from 'three';
import type { HanoiState, Stand } from '@/lib/games/hanoi/state';

export type ThreeNS = typeof THREE;

export interface HanoiSceneProps {
  /** Layer count for this tower, 3–8. */
  layers: number;
  /** Honour prefers-reduced-motion: no bob, crossfade instead of the arc, no
   *  wobble, a static win. Every beat keeps a non-motion alternative — the
   *  illegal move still lights the rim and still speaks. */
  reducedMotion?: boolean;
}

/** Sound + haptic beats the host maps onto the shared libraries. */
export type HanoiSfx =
  | 'lift'    // a layer picked up
  | 'settle'  // set back down where it was — no move
  | 'land'    // a legal move landed
  | 'wrong'   // the bump
  | 'hint'    // the ghost flew
  | 'win';

export interface HanoiCallbacks {
  /** Every legal move, with the new state. */
  onMove(state: HanoiState): void;
  /** Which stand's top layer is in the air, or null once it is down. */
  onHeld(stand: Stand | null): void;
  /** A bigger-onto-smaller attempt. Nothing was counted. */
  onIllegal(): void;
  /** The biggest layer just reached the target stand — the real halfway. */
  onHalfway(): void;
  /** The tower is complete. `moves` is the final legal count. */
  onWin(moves: number): void;
  onSfx?(name: HanoiSfx): void;
}

export interface HanoiEngine {
  /** Tap-tap input: the first tap lifts, the second lands (or bumps). The
   *  same stand twice sets the layer back down. */
  tapStand(stand: Stand): void;
  /** Fly a ghost of the next optimal move. Returns false once solved. The
   *  host owns the budget; the engine only shows. */
  hint(): boolean;
  /** Same tower again, fresh count. */
  reset(): void;
  resize(): void;
  getState(): HanoiState;
  dispose(): void;
}
