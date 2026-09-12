// Gamecakes shared game-theme module.
//
// One import for all the visual primitives every Phaser scene reuses:
//
//   import { palette, decor, effects, hud, createKid, makeBalloon } from '@/lib/games/theme';
//
// Or import individual symbols by name:
//
//   import { CAKE, KID_PALETTES, drawCakeySun, splashAt } from '@/lib/games/theme';
//
// Phase 1 scope (this commit): visual/effect primitives shared across
// Phaser scenes. Phase 2+ candidates: Target helper, base GamecakesScene
// class, more sprite types.

export * from './palette';
export * from './decor';
export * from './effects';
export * from './hud';
export * from './kid-sprite';
export * from './balloon';
export * from './critters';
export * from './cupcake';
export * from './score-tick';

// Re-export grouped namespaces for callers who prefer namespacing.
import * as palette from './palette';
import * as decor from './decor';
import * as effects from './effects';
import * as hud from './hud';
import * as critters from './critters';
export { palette, decor, effects, hud, critters };
