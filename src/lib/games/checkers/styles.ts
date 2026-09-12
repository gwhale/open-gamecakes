// The checker piece sets — what the kid is actually choosing between.
//
// A content module, like opponents.ts: pure data, no `three` even as a type.
// pieces.ts is a small interpreter that turns these recipes into meshes, so
// creative direction can add or retune a set without reading any geometry code.
//
// THE GOVERNING CONSTRAINT, and every decision below falls out of it:
//   A checker is a squat disc seen from a 3/4 camera on a 10" tablet — roughly
//   a 40px ellipse with about 12px of visible silhouette. THE TOP FACE IS THE
//   PIECE. Spend the budget on the face and the rim; a clever side profile is
//   invisible and costs the same.
//
// FOUR RULES EVERY SET OBEYS. There are dev assertions for all of them.
//
//  1. IDENTICAL FOOTPRINT (r = PIECE_R) AND NEAR-IDENTICAL HEIGHT. No set may be
//     easier to tap or occlude more of the board than another. Choosing a look
//     must never change how the game plays.
//
//  2. AT MOST 4 PARTS. All geometries and materials are shared across all 24
//     pieces, so a set costs 4 geometries and 2 materials however many pieces
//     are on the board. The budget is what stops a fifth set arriving at nine.
//
//  3. THE TWO-TELL RULE. The two sides must differ in VALUE (>=3:1) *and* in a
//     non-colour tell that survives greyscale. Colour alone fails a colour-blind
//     kid and fails a bright screen outdoors.
//
//  4. THE CREAM LINE. Every dark piece carries a light band at roughly a fifth
//     of its visible area. It keeps a dark piece from reading as a hole in the
//     board.
//
//  5. THE BODY IS ALWAYS THE TOP FACE. Accents are rims, bands and flecks. This
//     is what makes rule 3 checkable with one measurement per side instead of an
//     argument about which surface the camera mostly sees.
//
// ⚠️ WHY THE BODY COLOURS ARE SO CONSTRAINED, which is not a lack of
// imagination. Pieces stand on the cocoa playing square (see board.ts), and both
// sides must clear 3:1 against it. That forces the two bodies at least NINE to
// one apart from each other, which in this palette leaves exactly two bands:
//
//     cream    #fff8e7   4.32:1 on the square      ok
//     vanilla  #fef3c7   4.11:1                    ok
//     sponge   #fde8bd   3.80:1                    ok
//     ---------------------------------------------------
//     coin     #d9a441   2.03:1                    fails
//     chocolate#78350f   1.98:1                    fails
//     berry    #9f1239   1.75:1                    fails
//     ---------------------------------------------------
//     choc_deep#451a03   3.27:1                    ok
//
// So every light body is a cream and every dark body is the one chocolate that
// works, and the SETS ARE TOLD APART BY SILHOUETTE AND ACCENT instead. That is
// not a compromise — it is the same logic as the town's cake checkerboard, which
// is chocolate and vanilla precisely because monochrome would be off-brand. A
// mid-toned "cookie brown" piece looks great in a mockup and vanishes on an iPad
// in a bright kitchen.

import { CAKE, CAKEY_ROAD, SPRINKLE_COLORS } from '@/lib/games/theme/palette';

/** Every piece is this radius, in scene units where a square is 1.0. Rule 1. */
export const PIECE_R = 0.34;
/** Target height. Sets may vary within PIECE_H_TOLERANCE. */
export const PIECE_H = 0.3;
export const PIECE_H_TOLERANCE = 0.05;

/** Which material recipe from town/three/materials.ts a part is made of. */
export type MatKind = 'cookie' | 'cake' | 'frosting' | 'candy';

/** Which of a set's two colours a part wears. `accent` is the cream line. */
export type Slot = 'body' | 'accent';

/** The primitive vocabulary. Deliberately tiny — if a set needs something not
 *  in here, that is a signal the set is too complicated for a 40px disc. */
export type Part =
  | {
      kind: 'lathe';
      /** [radius, height] walking UP from the base. Start and end at radius 0 to
       *  cap the solid. */
      profile: ReadonlyArray<readonly [number, number]>;
      segments: number;
      mat: Slot;
    }
  | { kind: 'cylinder'; rTop: number; rBottom: number; h: number; y: number; segments: number; mat: Slot }
  /** Laid flat (rotated onto the board plane), so it reads as a rim or a band. */
  | { kind: 'torus'; r: number; tube: number; y: number; radial: number; tubular: number; mat: Slot }
  /** N tiny flecks scattered on the top face, sharing ONE geometry and ONE
   *  material — counts as a single part against the budget. `palette` overrides
   *  the slot colour when a set wants many-coloured sprinkles. */
  | { kind: 'flecks'; count: number; r: number; ring: number; y: number; mat: Slot; palette?: readonly number[] };

export interface PieceStyle {
  /** Stable forever — this is what the saved preference keys on. */
  id: string;
  name: string;
  /** One line for the picker card. */
  blurb: string;
  bodyMat: MatKind;
  accentMat: MatKind;
  light: { body: number; accent: number };
  dark: { body: number; accent: number };
  parts: readonly Part[];
}

/** The one dark that clears 3:1 on the cocoa playing square. See the note above. */
const DARK_BODY = CAKE.CHOCOLATE_DEEP;
/** The cream line (rule 4) — the light band every dark piece wears. */
const CREAM = 0xfff6e2;

export const PIECE_STYLES: readonly PieceStyle[] = [
  {
    id: 'sandwich',
    name: 'Sandwich Cookies',
    blurb: 'Two crisp wafers with a thick line of filling. The classic.',
    bodyMat: 'cookie',
    accentMat: 'frosting',
    // The light set is a golden sandwich with dark filling; the dark set is the
    // familiar one. Both are real cookies, and the accent inverts cleanly.
    light: { body: 0xfff8e7, accent: CAKE.CHOCOLATE },
    dark: { body: DARK_BODY, accent: CREAM },
    parts: [
      {
        // The pinch at the waist IS the sandwich, in one mesh. The profile never
        // narrows below 0.30 — a deeper pinch looks great side-on and is
        // completely invisible from the play camera.
        kind: 'lathe',
        profile: [
          [0, 0],
          [PIECE_R, 0],
          [PIECE_R, 0.1],
          [0.305, 0.105],
          [0.305, 0.195],
          [PIECE_R, 0.2],
          [PIECE_R, 0.29],
          [0, 0.3],
        ],
        segments: 24,
        mat: 'body',
      },
      // Filling squeezing out of the waist — proud of the pinch on purpose.
      { kind: 'cylinder', rTop: 0.312, rBottom: 0.312, h: 0.088, y: 0.15, segments: 20, mat: 'accent' },
      // Embossed ring on the top face. Sits ABOVE the 0.30 top — a ladder rung,
      // not a coplanar decal, because this repo has no polygonOffset.
      { kind: 'torus', r: 0.24, tube: 0.018, y: 0.303, radial: 6, tubular: 24, mat: 'accent' },
    ],
  },
  {
    id: 'petit-four',
    name: 'Frosted Layer Cakes',
    blurb: 'A little cake under a thick pour of icing, dripping down the sides.',
    bodyMat: 'frosting',
    accentMat: 'cake',
    // Body is the ICING, because the icing is the top face (rule 5). The sponge
    // is the band underneath, which is where the cream line lives on the dark
    // set.
    light: { body: CAKE.FROSTING, accent: CAKEY_ROAD.COOKIE_COIN },
    dark: { body: DARK_BODY, accent: CREAM },
    parts: [
      // Sponge, narrower than the icing so the pour overhangs it.
      { kind: 'cylinder', rTop: 0.312, rBottom: 0.312, h: 0.19, y: 0.095, segments: 24, mat: 'accent' },
      { kind: 'cylinder', rTop: PIECE_R, rBottom: PIECE_R, h: 0.11, y: 0.245, segments: 24, mat: 'body' },
      // The drip at the overhang — the same grammar as the frosting roofs on the
      // town's shop booths.
      { kind: 'torus', r: 0.31, tube: 0.03, y: 0.19, radial: 6, tubular: 22, mat: 'body' },
    ],
  },
  {
    id: 'chip-cookie',
    name: 'Chip Cookies',
    blurb: 'Baked a bit wonky, with chips in the top. Warm from the oven.',
    bodyMat: 'cookie',
    accentMat: 'cookie',
    light: { body: 0xfef3c7, accent: CAKE.CHOCOLATE_DEEP },
    dark: { body: DARK_BODY, accent: CREAM },
    parts: [
      {
        // Wider in the middle than at the top: a cookie that spread as it baked.
        kind: 'lathe',
        profile: [
          [0, 0],
          [0.325, 0.01],
          [PIECE_R, 0.07],
          [0.325, 0.17],
          [0.28, 0.25],
          [0, 0.28],
        ],
        segments: 22,
        mat: 'body',
      },
      // One geometry, one material, five instances — see the flecks part kind.
      { kind: 'flecks', count: 5, r: 0.045, ring: 0.17, y: 0.26, mat: 'accent' },
    ],
  },
  {
    id: 'macaron',
    name: 'Macarons',
    blurb: 'Two glossy shells with a ganache line and a proper frilly foot.',
    // Glossy is the whole macaron read, which is exactly what candyMat is for.
    bodyMat: 'candy',
    accentMat: 'frosting',
    light: { body: 0xfde8bd, accent: CAKE.STRAWBERRY },
    dark: { body: DARK_BODY, accent: CREAM },
    parts: [
      {
        kind: 'lathe',
        profile: [
          [0, 0],
          [0.3, 0.005],
          [PIECE_R, 0.055],
          [0.335, 0.115],
          [0.335, 0.185],
          [PIECE_R, 0.245],
          [0.3, 0.295],
          [0, 0.3],
        ],
        segments: 24,
        mat: 'body',
      },
      // The frilly foot at the seam — the single most recognisable thing about a
      // macaron, and the cream line on the dark set.
      { kind: 'torus', r: 0.3, tube: 0.04, y: 0.15, radial: 6, tubular: 22, mat: 'accent' },
    ],
  },
  {
    id: 'doughnut',
    name: 'Doughnut Rings',
    blurb: 'A glazed ring with sprinkles. The hole makes it easy to spot.',
    bodyMat: 'frosting',
    accentMat: 'cake',
    light: { body: CAKE.FROSTING, accent: CAKEY_ROAD.COOKIE_COIN },
    dark: { body: DARK_BODY, accent: CREAM },
    parts: [
      // The hole is this set's non-colour tell (rule 3) and it is the strongest
      // silhouette in the catalog — the only piece identifiable from its shadow.
      { kind: 'torus', r: 0.225, tube: 0.105, y: 0.115, radial: 10, tubular: 26, mat: 'body' },
      // The dough showing beneath the glaze. Sits lower and slightly wider.
      { kind: 'torus', r: 0.235, tube: 0.075, y: 0.062, radial: 8, tubular: 26, mat: 'accent' },
      { kind: 'flecks', count: 6, r: 0.03, ring: 0.225, y: 0.225, mat: 'accent', palette: SPRINKLE_COLORS },
    ],
  },
];

/** The set a kid gets before they choose. The plainest silhouette in the
 *  catalog, which makes it the most readable — the fancier sets are the reward
 *  for going and looking. */
export const DEFAULT_STYLE_ID = 'sandwich';

export function styleById(id: string): PieceStyle {
  return PIECE_STYLES.find((s) => s.id === id) ?? PIECE_STYLES.find((s) => s.id === DEFAULT_STYLE_ID)!;
}

/** Tallest point of a style, for the footprint assertions and for the camera's
 *  occlusion budget. */
export function styleHeight(style: PieceStyle): number {
  let top = 0;
  for (const p of style.parts) {
    if (p.kind === 'lathe') top = Math.max(top, ...p.profile.map(([, h]) => h));
    else if (p.kind === 'cylinder') top = Math.max(top, p.y + p.h / 2);
    else if (p.kind === 'torus') top = Math.max(top, p.y + p.tube);
    else top = Math.max(top, p.y + p.r);
  }
  return top;
}

/** Widest point of a style. */
export function styleRadius(style: PieceStyle): number {
  let r = 0;
  for (const p of style.parts) {
    if (p.kind === 'lathe') r = Math.max(r, ...p.profile.map(([rad]) => rad));
    else if (p.kind === 'cylinder') r = Math.max(r, p.rTop, p.rBottom);
    else if (p.kind === 'torus') r = Math.max(r, p.r + p.tube);
    else r = Math.max(r, p.ring + p.r);
  }
  return r;
}

if (process.env.NODE_ENV !== 'production') {
  /** WCAG relative luminance. Dev-only, so the cost does not matter. */
  const lum = (hex: number): number => {
    const ch = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (a: number, b: number): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** Must match SQUARE_PLAY in board.ts. Duplicated rather than imported so this
   *  content module stays dependency-free; the assertion below is what keeps
   *  them honest with each other. */
  const PLAY_SQUARE = CAKEY_ROAD.ROAD_COCOA;

  const ids = new Set<string>();
  for (const s of PIECE_STYLES) {
    if (ids.has(s.id)) console.warn(`[checkers/styles] duplicate style id "${s.id}"`);
    ids.add(s.id);

    // Rule 2 — the parts budget.
    if (s.parts.length > 4) console.warn(`[checkers/styles] ${s.id} has ${s.parts.length} parts, budget is 4`);

    // Rule 1 — nobody gets a bigger tap target or a taller occluder.
    const r = styleRadius(s);
    if (Math.abs(r - PIECE_R) > 0.02) {
      console.warn(`[checkers/styles] ${s.id} radius ${r.toFixed(3)} differs from PIECE_R ${PIECE_R}`);
    }
    const h = styleHeight(s);
    if (Math.abs(h - PIECE_H) > PIECE_H_TOLERANCE) {
      console.warn(`[checkers/styles] ${s.id} height ${h.toFixed(3)} is outside ${PIECE_H}±${PIECE_H_TOLERANCE}`);
    }

    // Rules 3 and 4 — both bodies legible on the square they stand on.
    for (const side of ['light', 'dark'] as const) {
      const c = contrast(s[side].body, PLAY_SQUARE);
      if (c < 3) {
        console.warn(
          `[checkers/styles] ${s.id} ${side} body is ${c.toFixed(2)}:1 on the playing square — needs 3:1. ` +
            'A piece nobody can see is not a style choice.',
        );
      }
    }
    // The two sides must be told apart by VALUE, not just hue.
    const sides = contrast(s.light.body, s.dark.body);
    if (sides < 3) {
      console.warn(`[checkers/styles] ${s.id}: the two sides are only ${sides.toFixed(2)}:1 apart in value`);
    }
  }
}
