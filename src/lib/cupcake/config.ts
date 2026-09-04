// Cupcake-avatar config + catalog.
//
// Every Gamecakes kid has a CupcakeConfig stored in kids.cupcake_config
// (JSONB). The renderer (src/components/cupcake/CupcakeAvatar.tsx)
// draws an SVG avatar from this config; the future shop page lets the
// kid spend coins to unlock new options + apply them.
//
// All configs validate against this catalog. Server-side mutation
// routes MUST validate before saving — otherwise a kid could send
// `{wrapper: 'glitter-bomb'}` and break the renderer downstream. Use
// `isValidCupcakeConfig()` at any boundary that accepts user input.

// ---------------------------------------------------------------------------
// The four customization dimensions.
// ---------------------------------------------------------------------------

export type Wrapper =
  | 'plain'
  | 'vanilla'
  | 'chocolate'
  | 'strawberry'
  | 'mint'
  | 'lemon';

export type Frosting =
  | 'white'
  | 'pink'
  | 'mint'
  | 'blue'
  | 'lemon'
  | 'chocolate';

export type Topping =
  | 'none'
  | 'cherry'
  | 'sprinkles'
  | 'candle'
  | 'star'
  | 'rainbow';

export type Variety = 'classic' | 'tall' | 'mini' | 'fancy';

/** The base pastry form. `cupcake` is the free default everyone starts
 *  with; kids can spend Sugar Tokens at the Cakey Store to upgrade to a
 *  `cakepop` (frosting-coated ball on a stick) or a `layered` cake
 *  (stacked sponge tiers). Frosting + topping still apply on whichever
 *  base is chosen — see CupcakeAvatar's per-base render. */
export type Base = 'cupcake' | 'cakepop' | 'layered';

export interface CupcakeConfig {
  base: Base;
  wrapper: Wrapper;
  frosting: Frosting;
  topping: Topping;
  variety: Variety;
}

/** The default cupcake every kid starts with. Cupcake base, kraft-paper
 *  wrapper, white frosting, no topping, classic size. Bland by design —
 *  the customization journey is the entire point of the shop. Mirrored
 *  in the database default in migration 0018 / 0023. */
export const PLAIN_CUPCAKE: CupcakeConfig = {
  base: 'cupcake',
  wrapper: 'plain',
  frosting: 'white',
  topping: 'none',
  variety: 'classic',
};

// ---------------------------------------------------------------------------
// Color tables — the renderer reads these to pick fills + strokes.
// Kept here (not in @/lib/games/theme/palette) because they're avatar-
// scoped and drift in their own dimensions; the cake-brand palette
// stays focused on game scenes.
// ---------------------------------------------------------------------------

export const WRAPPER_COLORS: Record<
  Wrapper,
  { paper: string; band: string; ridge: string }
> = {
  // Kraft-paper brown — the "default cupcake liner" everyone recognizes.
  plain:      { paper: '#8b5e3c', band: '#6b4423', ridge: '#a47148' },
  vanilla:    { paper: '#fef3c7', band: '#fde68a', ridge: '#fffbe5' },
  chocolate:  { paper: '#451a03', band: '#1f0a01', ridge: '#5b2410' },
  strawberry: { paper: '#fb7185', band: '#be185d', ridge: '#f9a8d4' },
  mint:       { paper: '#86efac', band: '#16a34a', ridge: '#bbf7d0' },
  lemon:      { paper: '#fde047', band: '#ca8a04', ridge: '#fef3c7' },
};

export const FROSTING_COLORS: Record<
  Frosting,
  { fill: string; shade: string; highlight: string }
> = {
  white:     { fill: '#ffffff', shade: '#f1f5f9', highlight: '#ffffff' },
  pink:      { fill: '#f9a8d4', shade: '#ec4899', highlight: '#fce7f3' },
  mint:      { fill: '#86efac', shade: '#22c55e', highlight: '#bbf7d0' },
  blue:      { fill: '#93c5fd', shade: '#3b82f6', highlight: '#dbeafe' },
  lemon:     { fill: '#fef08a', shade: '#eab308', highlight: '#fef9c3' },
  chocolate: { fill: '#78350f', shade: '#451a03', highlight: '#a16207' },
};

/** Variety affects scale + frosting height. classic = baseline; tall
 *  stacks two frosting swirls; mini scales the whole sprite down to
 *  ~70%; fancy adds a foil-collar accent. */
export const VARIETY_TRAITS: Record<
  Variety,
  { scale: number; frostingStacks: 1 | 2; collar: boolean }
> = {
  classic: { scale: 1.0,  frostingStacks: 1, collar: false },
  tall:    { scale: 1.0,  frostingStacks: 2, collar: false },
  mini:    { scale: 0.72, frostingStacks: 1, collar: false },
  fancy:   { scale: 1.05, frostingStacks: 1, collar: true  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_BASES: ReadonlySet<Base> = new Set([
  'cupcake', 'cakepop', 'layered',
]);
const VALID_WRAPPERS: ReadonlySet<Wrapper> = new Set([
  'plain', 'vanilla', 'chocolate', 'strawberry', 'mint', 'lemon',
]);
const VALID_FROSTINGS: ReadonlySet<Frosting> = new Set([
  'white', 'pink', 'mint', 'blue', 'lemon', 'chocolate',
]);
const VALID_TOPPINGS: ReadonlySet<Topping> = new Set([
  'none', 'cherry', 'sprinkles', 'candle', 'star', 'rainbow',
]);
const VALID_VARIETIES: ReadonlySet<Variety> = new Set([
  'classic', 'tall', 'mini', 'fancy',
]);

/** True iff the input is a CupcakeConfig with all four fields valid.
 *  Use at every server-side boundary that accepts user-supplied
 *  config — the renderer assumes valid input and will throw on
 *  unknown wrapper/frosting/etc. */
export function isValidCupcakeConfig(x: unknown): x is CupcakeConfig {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.base === 'string'     && VALID_BASES.has(c.base as Base) &&
    typeof c.wrapper === 'string'  && VALID_WRAPPERS.has(c.wrapper as Wrapper) &&
    typeof c.frosting === 'string' && VALID_FROSTINGS.has(c.frosting as Frosting) &&
    typeof c.topping === 'string'  && VALID_TOPPINGS.has(c.topping as Topping) &&
    typeof c.variety === 'string'  && VALID_VARIETIES.has(c.variety as Variety)
  );
}

/** Coerce an arbitrary value into a CupcakeConfig, falling back to
 *  PLAIN_CUPCAKE for any field that fails validation. Use on the
 *  read path so a row written by an older code version (or a manual
 *  database edit) doesn't crash the renderer. */
export function coerceCupcakeConfig(x: unknown): CupcakeConfig {
  if (isValidCupcakeConfig(x)) return x;
  if (!x || typeof x !== 'object') return PLAIN_CUPCAKE;
  const c = x as Record<string, unknown>;
  return {
    // `base` defaults to 'cupcake' so legacy rows written before the
    // Cakey Store base upgrade (migration 0023) render as a cupcake.
    base:     VALID_BASES.has(c.base as Base)             ? (c.base as Base)         : 'cupcake',
    wrapper:  VALID_WRAPPERS.has(c.wrapper as Wrapper)   ? (c.wrapper as Wrapper)   : 'plain',
    frosting: VALID_FROSTINGS.has(c.frosting as Frosting) ? (c.frosting as Frosting) : 'white',
    topping:  VALID_TOPPINGS.has(c.topping as Topping)   ? (c.topping as Topping)   : 'none',
    variety:  VALID_VARIETIES.has(c.variety as Variety)   ? (c.variety as Variety)   : 'classic',
  };
}

// ---------------------------------------------------------------------------
// Future shop catalog — what kids can unlock with coins.
//
// Lives here so the shop page, the unlock API, and the renderer all
// share one source of truth for what's purchasable and what it costs.
// Plain-pool items aren't in this catalog; everything below is locked
// until the kid pays.
// ---------------------------------------------------------------------------

export interface UnlockCost {
  kind: 'base' | 'wrapper' | 'frosting' | 'topping' | 'variety';
  value: string; // narrowed by the matching dimension
  cost: number;  // tokens
}

export const UNLOCK_CATALOG: ReadonlyArray<UnlockCost> = [
  // Base — the pastry form. The headline Cakey Store upgrade. Cupcake
  // is the free default; cake pop and layered cake are aspirational
  // top-tier goals (a layered cake is the "you've really been playing"
  // flex).
  { kind: 'base', value: 'cakepop', cost: 20 },
  { kind: 'base', value: 'layered', cost: 40 },

  // Wrappers — pastry liners. Cheap.
  { kind: 'wrapper', value: 'vanilla',    cost: 4 },
  { kind: 'wrapper', value: 'chocolate',  cost: 5 },
  { kind: 'wrapper', value: 'strawberry', cost: 6 },
  { kind: 'wrapper', value: 'mint',       cost: 6 },
  { kind: 'wrapper', value: 'lemon',      cost: 7 },

  // Frostings — the visual statement. Mid-tier.
  { kind: 'frosting', value: 'pink',      cost: 5 },
  { kind: 'frosting', value: 'mint',      cost: 6 },
  { kind: 'frosting', value: 'blue',      cost: 7 },
  { kind: 'frosting', value: 'lemon',     cost: 8 },
  { kind: 'frosting', value: 'chocolate', cost: 10 },

  // Toppings — the personality. Higher tier.
  { kind: 'topping', value: 'cherry',    cost: 8 },
  { kind: 'topping', value: 'sprinkles', cost: 10 },
  { kind: 'topping', value: 'candle',    cost: 12 },
  { kind: 'topping', value: 'star',      cost: 18 },
  { kind: 'topping', value: 'rainbow',   cost: 25 },

  // Varieties — the silhouette change. Top tier.
  { kind: 'variety', value: 'mini',  cost: 15 },
  { kind: 'variety', value: 'tall',  cost: 20 },
  { kind: 'variety', value: 'fancy', cost: 30 },
];

/** Total coins to fully unlock everything in the shop.
 *  Useful for "X% complete" displays + parent dashboards.
 *  Currently 222 tokens at the rates above — about 4-6 weeks of
 *  daily play for a kid earning 1 token per session, ~5 sessions/week. */
export const UNLOCK_CATALOG_TOTAL_COST = UNLOCK_CATALOG.reduce(
  (sum, item) => sum + item.cost,
  0,
);
