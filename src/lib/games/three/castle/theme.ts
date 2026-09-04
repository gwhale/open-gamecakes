// Castle Crumble's OWN landscape identity.
//
// Castle Crumble was forked from Sandcastle Siege and — until now — reused
// Sandcastle's shared LANDSCAPE_THEMES via resolveTheme(). Several of those
// have tan/cream "dune" grounds (Vanilla Dunes, Cocoa Dusk), which made the
// candy-cannon demolition puzzle still read as a sandcastle on a beach.
//
// These themes replace that entirely: a bright "frosting battlefield" — every
// tier is a frosted-cake surface (pale piped-frosting ground, bubblegum/cream
// skies, airy light) strewn with rainbow sprinkles. Same LandscapeTheme shape
// the engine already consumes (sky/fog/ground/ambient/sun/candy), so nothing
// downstream changes — the host just resolves from here instead of Sandcastle.

import type { LandscapeTheme } from '../types';

// Rainbow sprinkles scattered as candy decor on every frosting tier. Pulls the
// brand + sprinkle hues so nothing drifts off-palette.
const SPRINKLES = [0xfb7185, 0x6ee7b7, 0xfbbf24, 0x93c5fd, 0xf9a8d4, 0xa7f3d0];

/** The frosting battlefield. Each entry is a frosted-cake surface in a
 *  different flavor; all are high-key and unmistakably icing, never sand.
 *  Cycled by tier for variety while keeping one clear identity. */
export const CASTLE_THEMES: LandscapeTheme[] = [
  { name: 'Strawberry Frosting', sky: 0xffc2f0, fog: 0xffd0ee, ground: 0xffd9ec, ambient: 0xffffff, sun: 0xfff0f6, candy: SPRINKLES },
  { name: 'Vanilla Frosting',    sky: 0xfff0d6, fog: 0xfff2df, ground: 0xfff3e6, ambient: 0xffffff, sun: 0xfff6e0, candy: SPRINKLES },
  { name: 'Mint Frosting',       sky: 0xc8f6e6, fog: 0xd6f2ea, ground: 0xdff7ee, ambient: 0xffffff, sun: 0xeafff7, candy: SPRINKLES },
  { name: 'Bubblegum Frosting',  sky: 0xffcdf2, fog: 0xffd6ef, ground: 0xffe0f4, ambient: 0xffffff, sun: 0xfff0fb, candy: SPRINKLES },
  { name: 'Blueberry Frosting',  sky: 0xd2ddff, fog: 0xdbe4ff, ground: 0xe4ecff, ambient: 0xffffff, sun: 0xeef2ff, candy: SPRINKLES },
  { name: 'Lemon Frosting',      sky: 0xfff4bf, fog: 0xfef0c8, ground: 0xfff7d6, ambient: 0xffffff, sun: 0xfffbe6, candy: SPRINKLES },
];

/** Pick a frosting theme for the given level (1-based), cycling for variety.
 *  Mirrors resolveTheme()'s signature so it's a drop-in replacement. */
export function resolveCastleTheme(level: number): LandscapeTheme {
  const i = (Math.max(1, level) - 1) % CASTLE_THEMES.length;
  return CASTLE_THEMES[i];
}
