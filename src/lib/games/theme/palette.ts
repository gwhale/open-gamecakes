// Gamecakes shared color palette.
//
// This is the canonical color vocabulary every Phaser scene should pull
// from. Values are 0xRRGGBB integers so they can be passed directly to
// Phaser graphics calls (fillStyle, lineStyle, setStrokeStyle, etc).
// Where a color is also needed in CSS form (HUD text, modal styling),
// the same hex is exported as a `'#…'` string sibling.
//
// Two design rules:
//   1. Cake palette is universal — every Gamecakes scene uses these so
//      the brand reads consistently from /map → game → modal.
//   2. Per-game palettes (sky, sea, space, …) layer on top of, not
//      replace, the cake palette. A space game still uses the strawberry
//      red for the score badge accent so the brand is present even when
//      the scene's setting is non-cake.
//
// When adding a new color: name it semantically (what role it plays),
// not literally (its hex value). 'BAND_DK' is wrong; 'RUBBER_BAND_DK'
// or 'SLINGSHOT_BAND_DK' is right.

// ---------------------------------------------------------------------------
// Cake brand palette — the strawberry/mint/vanilla/frosting trio
// ---------------------------------------------------------------------------

export const CAKE = {
  STRAWBERRY:      0xfb7185,
  STRAWBERRY_DEEP: 0xe11d48,
  STRAWBERRY_DARK: 0x9f1239,
  MINT:            0x86efac,
  MINT_DEEP:       0x4ade80,
  MINT_DARK:       0x16a34a,
  GOAL_MINT:       0x10b981,
  VANILLA:         0xfef3c7,
  VANILLA_DEEP:    0xfde68a,
  FROSTING:        0xffffff,
  CHOCOLATE:       0x78350f,
  CHOCOLATE_DEEP:  0x451a03,
  AMBER:           0xfbbf24,
  AMBER_DEEP:      0xf59e0b,
} as const;

// ---------------------------------------------------------------------------
// Sprinkle confetti — used by `drawSprinkles()` to seed cake-themed flecks
// on backgrounds. Also good for celebration bursts.
// ---------------------------------------------------------------------------

export const SPRINKLE_COLORS = [
  0xfb7185, 0x6ee7b7, 0xfbbf24, 0x93c5fd, 0xf9a8d4, 0xa7f3d0,
] as const;

// ---------------------------------------------------------------------------
// Sky palette — for outdoor scenes (Water Balloons, future games).
// Three bands top→horizon read as depth without needing a real gradient.
// ---------------------------------------------------------------------------

export const SKY = {
  TOP: 0x7dd3fc,
  MID: 0xbae6fd,
  LOW: 0xe0f2fe,
  // Cooler/dimmer variant for stormy scenes
  TOP_DIM: 0x60a5fa,
  MID_DIM: 0x93c5fd,
} as const;

// ---------------------------------------------------------------------------
// Grass palette — three bands lit→shadow.
// ---------------------------------------------------------------------------

export const GRASS = {
  LIT:    0x86efac,
  MID:    0x4ade80,
  SHADOW: 0x166534,
} as const;

// ---------------------------------------------------------------------------
// Wood palette — fences, crates, slingshot posts, tree trunks.
// ---------------------------------------------------------------------------

export const WOOD = {
  PALE:        0xfde68a,
  PALE_DEEP:   0xb45309,
  PLANK:       0xb45309,
  PLANK_LIGHT: 0xd97706,
  PLANK_DARK:  0x78350f,
  POST:        0x78350f,
  POST_DARK:   0x451a03,
} as const;

// ---------------------------------------------------------------------------
// Water palette — splashes, balloons, droplets, swimming pool tiles.
// ---------------------------------------------------------------------------

export const WATER = {
  BALLOON:      0x3b82f6,
  BALLOON_DEEP: 0x1d4ed8,
  BALLOON_HI:   0x93c5fd,
  SPLASH:       0x38bdf8,
  DROPLET:      0x60a5fa,
} as const;

// ---------------------------------------------------------------------------
// Sun palette — disc + glow + ray colors. Cake-themed sun is amber, not
// hot yellow, so it harmonizes with the strawberry/mint palette.
// ---------------------------------------------------------------------------

export const SUN = {
  DISC: 0xfacc15,
  GLOW: 0xfde68a,
  FACE: 0x451a03,
} as const;

// ---------------------------------------------------------------------------
// Tree palette — trunk + canopy.
// ---------------------------------------------------------------------------

export const TREE = {
  TRUNK:      0x78350f,
  TRUNK_DARK: 0x451a03,
  CANOPY:     0x16a34a,
  CANOPY_HI:  0x22c55e,
} as const;

// ---------------------------------------------------------------------------
// Mountain palette — for snowy peaks (Gamecakes City's Meringue Mountain
// region landmark). Slate rock with white snow caps reads cleanly on the
// green grass world bed.
// ---------------------------------------------------------------------------

export const MOUNTAIN = {
  ROCK:      0x9ca3af, // slate-400
  ROCK_DARK: 0x4b5563, // slate-600 (shadow side)
  SNOW:      0xffffff, // peak cap
  SNOW_EDGE: 0xe5e7eb, // gray-200 (snow shadow)
} as const;

// ---------------------------------------------------------------------------
// Sand palette — beaches, dunes, dock pilings. Pale dry on top, deep wet
// where it meets water.
// ---------------------------------------------------------------------------

export const SAND = {
  PALE: 0xfde68a, // amber-200 (dry)
  DEEP: 0xd97706, // amber-600 (wet edge)
} as const;

// ---------------------------------------------------------------------------
// Ribbon palette — for Disney-style scrollwork banners on the town map.
// Each region gets cycled to a different color so the labels stand apart
// (Adventureland green, Frontierland orange, Fantasyland pink, etc).
// `_DEEP` shades go on the scrollwork tail notches for shading.
// ---------------------------------------------------------------------------

export const RIBBON = {
  STRAWBERRY:      0xfb7185,
  STRAWBERRY_DEEP: 0xe11d48,
  MINT:            0x16a34a,
  MINT_DEEP:       0x15803d,
  AMBER:           0xfbbf24,
  AMBER_DEEP:      0xb45309,
  BLUE:            0x3b82f6,
  BLUE_DEEP:       0x1d4ed8,
  PINK:            0xec4899,
  PINK_DEEP:       0xbe185d,
  PURPLE:          0xa855f7,
  PURPLE_DEEP:     0x7e22ce,
} as const;

// ---------------------------------------------------------------------------
// World palette — tokens specific to the 3D town diorama (Gamecakes City):
// piped frosting trails, candy glow halos, and scattered candy props. Kept
// here (not just in the town engine) so the town and the games share one
// source of truth. See src/lib/town/three/materials.ts for the material
// recipes that consume these.
// ---------------------------------------------------------------------------

export const WORLD = {
  FROSTING_PATH:      0xfff4e2, // piped-cream trail surface (was flat gold road)
  FROSTING_PATH_EDGE: 0xf3d9b0, // deeper cream for the piped trail borders
  GLOW_PINK:          0xffb3dd, // cotton-candy cloud glow halo
  GLOW_WARM:          0xffe6a8, // warm booth-sign glow halo
  WAFER:              0xe7c48a, // biscuit "pebble" prop
  // Weather sky tints — all warm/light per the cozy-diorama bar (a Gamecakes
  // storm is periwinkle, never grey). Consumed by src/lib/town/three/weather.ts.
  SKY_OVERCAST:       0xf2e6ef, // pale pink-cream cloudy sky
  SKY_SHOWER:         0xd8e9f2, // soft blue-cream sprinkle-shower sky
  SKY_SNOW:           0xeef4fb, // bright pale sugar-snow sky
  SKY_STORM:          0xcfd8f0, // soft periwinkle storm sky (NOT grey)
  SKY_RAINBOW:        0xc7ecff, // clearing-sky blue for the rainbow melt
  CLOUD_PINK:         0xffa3d3, // cotton-candy cloud body (matches city3d fog)
  // Glossy candy colors for scattered gumdrops (pulls from the brand + sprinkle
  // hues so props never drift off-palette).
  GUMDROP: [0xfb7185, 0x6ee7b7, 0xfbbf24, 0x93c5fd, 0xc084fc] as const,
  // Terrain vertex-paint colors for the 3D town ground (engine.ts bakes these
  // into the displaced ground mesh — grass inland, sand at the shore, seabed
  // under the water, and the frosting cap on the mountain's upper slopes).
  TERRAIN_GRASS:      0x9adc9f,
  TERRAIN_SAND:       0xf1e2b3,
  TERRAIN_SEABED:     0x3f7f92,
  TERRAIN_FROSTING:   0xfff0f6, // mountain frosting cap
  GRASS_TUFT:         0x8fd08f, // instanced grass-tuft cones on the open ground
  // Shop-booth body colors (city3d) — bright distinct candy shells, cycled per
  // booth so each game shop pops off its pad as its own little building.
  SHOP_BODIES: [0xfb7185, 0x60a5fa, 0x34d399, 0xfbbf24, 0xc084fc, 0xf472b6] as const,
} as const;

// ---------------------------------------------------------------------------
// Trap palette — cake-hole-style hazards. Deep indigo + violet ring is
// the established Gamecakes "danger" cue (Marble Maze cake holes).
// ---------------------------------------------------------------------------

export const TRAP = {
  HOLE: 0x1e1b4b,
  RING: 0x7c3aed,
} as const;

// ---------------------------------------------------------------------------
// Bullseye palette — concentric ring colors for target rings.
// ---------------------------------------------------------------------------

export const BULLSEYE = {
  OUTER:  CAKE.STRAWBERRY,
  MID:    CAKE.VANILLA_DEEP,
  INNER:  0xffffff,
  STROKE: CAKE.STRAWBERRY_DARK,
  STAND:  0x6b7280,
  BASE:   0x4b5563,
} as const;

// ---------------------------------------------------------------------------
// Kid sprite palettes — used by `KidSprite`. Six mix-and-match outfits
// give a small crowd a believable variety. Skin tones span pale → dark;
// hair, shirt, pants are unrelated draws so kids feel individual.
// ---------------------------------------------------------------------------

export interface KidPalette {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
}

export const KID_PALETTES: readonly KidPalette[] = [
  { skin: 0xfde2bf, hair: 0x4a2c2a, shirt: 0xef4444, pants: 0x1d4ed8 }, // dark hair, red shirt
  { skin: 0xfcd9b6, hair: 0xfcd34d, shirt: 0x10b981, pants: 0x78350f }, // blonde, green shirt
  { skin: 0xc89770, hair: 0x171717, shirt: 0xfbbf24, pants: 0x0f766e }, // medium tone, yellow shirt
  { skin: 0xe9b48f, hair: 0x854d0e, shirt: 0xa855f7, pants: 0x1f2937 }, // brown hair, purple shirt
  { skin: 0xfde2bf, hair: 0xfb7185, shirt: 0x06b6d4, pants: 0x9a3412 }, // pink hair, cyan shirt
  { skin: 0x9c6644, hair: 0x000000, shirt: 0xfb923c, pants: 0x166534 }, // dark tone, orange shirt
];

// ---------------------------------------------------------------------------
// CSS-string siblings for HUD text overlays (Phaser text takes CSS strings
// for `color`, `stroke`, `backgroundColor`).
// ---------------------------------------------------------------------------

export const CSS = {
  TEXT_DARK:        '#0f172a',
  TEXT_LIGHT:       '#ffffff',
  TEXT_STRAWBERRY:  '#7f1d1d',
  TEXT_NAVY:        '#1e3a8a',
  HUD_PANEL:        '#000000',
  TIMER_WARN:       '#ef4444',
  SCORE_KID:        '#0ea5e9',
  SCORE_BULLSEYE:   '#facc15',
  SCORE_CRATE:      '#fbbf24',
} as const;

// ---------------------------------------------------------------------------
// Cakey Road palette — the crossy-hopper's lane, hazard, gate, and prop
// colors. Named by ROLE (per rule 1 above), and aliased to the shared brand
// tokens wherever possible so nothing drifts off-palette. The three color
// choices below are load-bearing for READABILITY, not taste:
//   • RIVER_SYRUP is deep glossy pink so water never reads as walkable ground.
//   • Hazards are striped/dark and never round-and-gold (that's COOKIE_COIN).
//   • PLAYER_RING is a cool cyan finder-ring so the cupcake never vanishes on
//     a warm/cream lane regardless of its saved config colors.
// ---------------------------------------------------------------------------

export const CAKEY_ROAD = {
  // Lane beds
  GRASS_LIT:   GRASS.LIT,          // safe row (light band)
  GRASS_MID:   GRASS.MID,          // safe row (dark band, alternating)
  ROAD_COCOA:  0x9c6b3f,           // warm milk-cocoa road (NOT muddy brown)
  ROAD_DASH:   WORLD.FROSTING_PATH,// white piped-frosting dashed centerline
  RIVER_SYRUP: CAKE.STRAWBERRY_DEEP, // glossy strawberry syrup = "don't step"
  RIVER_SHEEN: CAKE.STRAWBERRY,    // moving specular sheen highlight
  RAIL_GRAVEL: CAKE.VANILLA,       // vanilla-gravel rail bed
  RAIL_TIE:    CAKE.CHOCOLATE_DEEP,// licorice rails/ties
  // Hazards (striped, lane-wide, never round-and-gold)
  HAZARD_PEPPERMINT:        CAKE.STRAWBERRY_DEEP, // steamroller body
  HAZARD_PEPPERMINT_STRIPE: CAKE.FROSTING,        // candy caution stripe
  HAZARD_LICORICE:          CAKE.CHOCOLATE_DEEP,  // licorice-wheel roller
  HAZARD_TROLLEY:           WOOD.PLANK,           // gingerbread trolley
  // Rafts + river props
  RAFT_WAFER:  WORLD.WAFER,        // matte biscuit-tan wafer raft
  // Sugar Express
  TRAIN_BODY:  CAKE.STRAWBERRY,
  TRAIN_TRIM:  CAKE.FROSTING,
  TRAIN_LAMP:  CAKE.AMBER,
  SIGNAL_STOP: CAKE.STRAWBERRY_DEEP, // blinking crossing signal (danger)
  SIGNAL_GO:   CAKE.MINT_DEEP,       // clear
  // Gate arch (echoes the town land-unlock archway grammar)
  GATE_ARCH:   RIBBON.AMBER,
  GATE_GLOW:   WORLD.GLOW_WARM,
  // Cookie-coins (browner than SUN.DISC so they never read as lemon)
  COOKIE_COIN: 0xd9a441,
  COOKIE_CHIP: CAKE.CHOCOLATE,
  // Safe-lane decor
  TREE_TRUNK:  TREE.TRUNK,
  TREE_CANOPY: CAKE.MINT,
  CANE_STRIPE: CAKE.STRAWBERRY_DEEP,
  // Player finder-ring (mandatory readability aid)
  PLAYER_RING: SKY.TOP,
} as const;

// ---------------------------------------------------------------------------
// Cakey Racer — the Victory Lane circuit.
//
// Deliberately shares ROAD_COCOA with Cakey Road: a Gamecakes road is a cocoa
// road wherever you meet it. What makes this one read as a RACE track is the
// grammar on top of the surface — candy-cane kerbs, a frosting racing line, a
// checkered start/finish in cake-not-monochrome, and an amber ribbon arch at
// each boost gate (the same archway grammar as the town's land unlocks).
// ---------------------------------------------------------------------------

export const RACER = {
  // Surface
  ASPHALT:      0x9c6b3f,          // cocoa road (shared with CAKEY_ROAD)
  ASPHALT_WORN: 0x8a5c35,          // slightly darker inside line, sells camber
  RACING_LINE:  WORLD.FROSTING_PATH, // piped-frosting dashes down the middle
  // Kerbs — peppermint stripe. Alternating blocks, never a painted texture.
  KERB_A:       CAKE.STRAWBERRY_DEEP,
  KERB_B:       CAKE.FROSTING,
  // Off-track. Sugar rough is a pale crumb shoulder, then mint lawn beyond.
  ROUGH_SUGAR:  CAKE.VANILLA_DEEP,
  LAWN:         WORLD.TERRAIN_GRASS,
  // Start/finish. A cake checkerboard is chocolate + vanilla, NOT black/white —
  // monochrome is the one thing on this island that would look off-brand.
  CHECKER_A:    CAKE.CHOCOLATE_DEEP,
  CHECKER_B:    CAKE.VANILLA,
  GANTRY:       CAKE.STRAWBERRY,
  // Boost gate (echoes CAKEY_ROAD.GATE_ARCH / the town unlock arch)
  GATE_ARCH:    RIBBON.AMBER,
  GATE_GLOW:    WORLD.GLOW_WARM,
  BOOST_FLAME:  CAKE.AMBER,        // exhaust puff while the boost is live
  // Hazards + scenery
  CONE:         0xf97316,          // candy-corn orange cone
  CONE_STRIPE:  CAKE.FROSTING,
  TYRE_STACK:   CAKE.CHOCOLATE_DEEP, // licorice tyre walls on the outside line
  GUMDROP:      WORLD.GUMDROP,     // roadside gumdrop crowd
  // Player car — bodywork is painted from the kid's frosting choice; this is
  // the fallback for guests with no saved cupcake.
  PLAYER_BODY:  0x60a5fa,
  PLAYER_TRIM:  CAKE.FROSTING,
} as const;
