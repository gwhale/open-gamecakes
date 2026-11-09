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
// The customization dimensions.
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

/** Hat worn on top of the treat. A topping still shows: it rides on the hat. */
export type Hat = 'none' | 'party' | 'beanie' | 'tophat' | 'wizard' | 'crown';

export type Glasses = 'none' | 'round' | 'sunnies' | 'heart' | 'star';

/** The character's expression. 'none' keeps the faceless look every saved
 *  cupcake had before faces existed; 'smile' is free so any kid can have one. */
export type Face = 'none' | 'smile' | 'grin' | 'wink' | 'sleepy' | 'silly';

/** Curated swatch palette for the free colour pickers. Keys are stored in the
 *  config (never raw hex) so validation stays a set lookup. */
export type PaintColor =
  | 'cherry'
  | 'tangerine'
  | 'sunshine'
  | 'lime'
  | 'mint'
  | 'sky'
  | 'ocean'
  | 'grape'
  | 'bubblegum'
  | 'snow'
  | 'cocoa'
  | 'licorice';

/** A bought colour for the frosting or wrapper. 'none' keeps the named
 *  frosting / wrapper colour; any palette colour paints over it. */
export type CustomColor = PaintColor | 'none';

export interface CupcakeConfig {
  base: Base;
  wrapper: Wrapper;
  frosting: Frosting;
  topping: Topping;
  variety: Variety;
  hat: Hat;
  glasses: Glasses;
  face: Face;
  /** Free colour pick for the hat. */
  hatColor: PaintColor;
  /** Free colour pick for the glasses frames. */
  glassesColor: PaintColor;
  /** Bought colour for the frosting; 'none' shows the frosting's own colour. */
  frostingColor: CustomColor;
  /** Bought colour for the wrapper; 'none' shows the wrapper's own colour. */
  wrapperColor: CustomColor;
}

/** Dimensions bought through kid_cupcake_unlocks (its `kind` column). */
export type UnlockKind =
  | 'base' | 'wrapper' | 'frosting' | 'topping' | 'variety'
  | 'hat' | 'glasses' | 'face' | 'frostingColor' | 'wrapperColor';

export const UNLOCK_KINDS: ReadonlyArray<UnlockKind> = [
  'base', 'wrapper', 'frosting', 'topping', 'variety', 'hat', 'glasses', 'face',
  'frostingColor', 'wrapperColor',
];

/** Free colour-pick fields; validated against PAINT_COLORS. The frosting and
 *  wrapper colours are bought per colour instead (see UNLOCK_CATALOG). */
export type PaintField = 'hatColor' | 'glassesColor';

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
  hat: 'none',
  glasses: 'none',
  face: 'none',
  hatColor: 'cherry',
  glassesColor: 'licorice',
  frostingColor: 'none',
  wrapperColor: 'none',
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

/** The colour-picker palette, in display order. `label` is for screen
 *  readers; `shade` is a darker edge for strokes. */
export const PAINT_COLORS: Record<PaintColor, { hex: string; shade: string; label: string }> = {
  cherry:    { hex: '#ef4444', shade: '#991b1b', label: 'Red' },
  tangerine: { hex: '#fb923c', shade: '#c2410c', label: 'Orange' },
  sunshine:  { hex: '#facc15', shade: '#a16207', label: 'Yellow' },
  lime:      { hex: '#84cc16', shade: '#3f6212', label: 'Lime green' },
  mint:      { hex: '#34d399', shade: '#047857', label: 'Mint green' },
  sky:       { hex: '#38bdf8', shade: '#0369a1', label: 'Sky blue' },
  ocean:     { hex: '#2563eb', shade: '#1e3a8a', label: 'Dark blue' },
  grape:     { hex: '#a855f7', shade: '#6b21a8', label: 'Purple' },
  bubblegum: { hex: '#f472b6', shade: '#be185d', label: 'Pink' },
  snow:      { hex: '#f8fafc', shade: '#94a3b8', label: 'White' },
  cocoa:     { hex: '#92400e', shade: '#451a03', label: 'Brown' },
  licorice:  { hex: '#1f2937', shade: '#030712', label: 'Black' },
};

export const PAINT_COLOR_ORDER = Object.keys(PAINT_COLORS) as PaintColor[];

/** Halfway from a #rrggbb colour to white, for highlights and ridges. */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number): number => Math.round(v + (255 - v) / 2);
  const rgb = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

/** The frosting colours to draw: the bought colour when one is set,
 *  otherwise the named frosting's. Every renderer reads this, not
 *  FROSTING_COLORS directly. */
export function frostingColors(c: CupcakeConfig): { fill: string; shade: string; highlight: string } {
  if (c.frostingColor === 'none') return FROSTING_COLORS[c.frosting];
  const p = PAINT_COLORS[c.frostingColor];
  return { fill: p.hex, shade: p.shade, highlight: lighten(p.hex) };
}

/** The wrapper colours to draw; see frostingColors. */
export function wrapperColors(c: CupcakeConfig): { paper: string; band: string; ridge: string } {
  if (c.wrapperColor === 'none') return WRAPPER_COLORS[c.wrapper];
  const p = PAINT_COLORS[c.wrapperColor];
  return { paper: p.hex, band: p.shade, ridge: lighten(p.hex) };
}

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
const VALID_HATS: ReadonlySet<Hat> = new Set([
  'none', 'party', 'beanie', 'tophat', 'wizard', 'crown',
]);
const VALID_GLASSES: ReadonlySet<Glasses> = new Set([
  'none', 'round', 'sunnies', 'heart', 'star',
]);
const VALID_FACES: ReadonlySet<Face> = new Set([
  'none', 'smile', 'grin', 'wink', 'sleepy', 'silly',
]);
const VALID_PAINTS: ReadonlySet<PaintColor> = new Set(PAINT_COLOR_ORDER);
const VALID_CUSTOM: ReadonlySet<CustomColor> = new Set<CustomColor>(['none', ...PAINT_COLOR_ORDER]);

/** Every valid value per config field: the one table that validation and
 *  coercion read from. */
const CUPCAKE_OPTIONS: { [K in keyof CupcakeConfig]: ReadonlySet<CupcakeConfig[K]> } = {
  base: VALID_BASES,
  wrapper: VALID_WRAPPERS,
  frosting: VALID_FROSTINGS,
  topping: VALID_TOPPINGS,
  variety: VALID_VARIETIES,
  hat: VALID_HATS,
  glasses: VALID_GLASSES,
  face: VALID_FACES,
  hatColor: VALID_PAINTS,
  glassesColor: VALID_PAINTS,
  frostingColor: VALID_CUSTOM,
  wrapperColor: VALID_CUSTOM,
};

const CONFIG_KEYS = Object.keys(CUPCAKE_OPTIONS) as Array<keyof CupcakeConfig>;

function validField(key: keyof CupcakeConfig, v: unknown): boolean {
  return typeof v === 'string' && (CUPCAKE_OPTIONS[key] as ReadonlySet<string>).has(v);
}

/** Parts that are free to wear without an unlock row: each dimension's plain
 *  default, plus a smiling face so every kid can give their character one. */
const FREE_EXTRAS: ReadonlySet<string> = new Set(['face:smile']);

export function isFreeCupcakeOption(kind: UnlockKind, value: string): boolean {
  return PLAIN_CUPCAKE[kind] === value || FREE_EXTRAS.has(`${kind}:${value}`);
}

/** True iff the input is a CupcakeConfig with every field valid.
 *  Use at every server-side boundary that accepts user-supplied
 *  config — the renderer assumes valid input and will throw on
 *  unknown wrapper/frosting/etc. */
export function isValidCupcakeConfig(x: unknown): x is CupcakeConfig {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  return CONFIG_KEYS.every((k) => validField(k, c[k]));
}

/** Fields added after the original five. A request that omits them (a client
 *  bundle from before they existed) gets the plain default; a request that
 *  sends one with a bad value is still rejected. */
const LATER_FIELDS: ReadonlySet<keyof CupcakeConfig> = new Set([
  'hat', 'glasses', 'face', 'hatColor', 'glassesColor', 'frostingColor', 'wrapperColor',
]);

/** Parse a user-submitted config (the apply route's body). Returns null when
 *  an original field is missing or any present field is invalid. */
export function parseCupcakeConfigInput(x: unknown): CupcakeConfig | null {
  if (!x || typeof x !== 'object') return null;
  const c = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of CONFIG_KEYS) {
    if (c[k] === undefined && LATER_FIELDS.has(k)) out[k] = PLAIN_CUPCAKE[k];
    else if (validField(k, c[k])) out[k] = c[k];
    else return null;
  }
  return out as unknown as CupcakeConfig;
}

/** Coerce an arbitrary value into a CupcakeConfig, falling back to
 *  PLAIN_CUPCAKE for any field that fails validation. Use on the
 *  read path so a row written by an older code version (or a manual
 *  database edit) doesn't crash the renderer. A legacy row with no `base`
 *  (pre-0023) renders as a cupcake; one saved before hats, glasses and
 *  faces existed comes back with those at their defaults. */
export function coerceCupcakeConfig(x: unknown): CupcakeConfig {
  if (isValidCupcakeConfig(x)) return x;
  if (!x || typeof x !== 'object') return PLAIN_CUPCAKE;
  const c = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of CONFIG_KEYS) out[k] = validField(k, c[k]) ? c[k] : PLAIN_CUPCAKE[k];
  return out as unknown as CupcakeConfig;
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
  kind: UnlockKind;
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

  // Faces — small mood swaps. 'smile' is free (see FREE_EXTRAS).
  { kind: 'face', value: 'grin',   cost: 4 },
  { kind: 'face', value: 'wink',   cost: 5 },
  { kind: 'face', value: 'sleepy', cost: 5 },
  { kind: 'face', value: 'silly',  cost: 6 },

  // Glasses — priced alongside wrappers and frostings.
  { kind: 'glasses', value: 'round',   cost: 6 },
  { kind: 'glasses', value: 'sunnies', cost: 8 },
  { kind: 'glasses', value: 'heart',   cost: 10 },
  { kind: 'glasses', value: 'star',    cost: 12 },

  // Hats — the big accessory, priced like toppings. Their colour is a free pick.
  { kind: 'hat', value: 'party',  cost: 8 },
  { kind: 'hat', value: 'beanie', cost: 10 },
  { kind: 'hat', value: 'tophat', cost: 14 },
  { kind: 'hat', value: 'wizard', cost: 18 },
  { kind: 'hat', value: 'crown',  cost: 25 },

  // Frosting and wrapper colours — any palette colour, bought one at a time,
  // priced like a mid frosting / wrapper.
  ...PAINT_COLOR_ORDER.map((value) => ({ kind: 'frostingColor' as const, value, cost: 6 })),
  ...PAINT_COLOR_ORDER.map((value) => ({ kind: 'wrapperColor' as const, value, cost: 5 })),
];

/** Total coins to fully unlock everything in the shop.
 *  Useful for "X% complete" displays + parent dashboards.
 *  Currently 525 tokens at the rates above — about 4-6 weeks of
 *  daily play for a kid earning 1 token per session, ~5 sessions/week. */
export const UNLOCK_CATALOG_TOTAL_COST = UNLOCK_CATALOG.reduce(
  (sum, item) => sum + item.cost,
  0,
);
