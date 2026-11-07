// Chess Island geometry check — run before touching the island's layout.
//
//   node --import ./scripts/lw-ts-alias.mjs scripts/chess-isle-check.mjs
//
// Chess Island now has TWO WINGS — chess east, checkers west — around a central
// plaza, and everything that makes that work is otherwise recorded only as
// comments. Comments do not fail a build. This asserts it instead:
//
//   1. The plaza booths FIT — adjacent roof cones keep real air between them,
//      and the tap proxies stay far enough apart that a near-miss cannot resolve
//      to the wrong booth. Wing booths are excluded from the row (see WING).
//   2. Every wing game is still in region.games. It must be: that array is what
//      getRegionForGame, unlock gating and the "every live game is placed"
//      invariant read. Moving a booth must never make its game unplaced.
//   3. Chess Challenge still holds the ARENA slot (the eastmost row offset).
//      This is the invariant the games[] ordering comment protects, and
//      prepending a new game is exactly how someone would break it by accident.
//   4. The island's bearing from the world centre is unchanged, so a future
//      CHESS_SIZE edit that breaks the parallel-vector trick gets caught here
//      rather than by an island visibly swinging round the map.
//   5. BOTH arenas are still on grass (nd <= 0.82), do not overlap each other,
//      and clear the plaza pad — three independent fixed offsets that nothing
//      else in the build compares.

import { registerHooks } from 'node:module';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// city3d.ts imports `maath/easing`, whose package exports node cannot resolve as
// a bare ESM directory. Point it at the built file so the real boothOffsetsPx
// can be imported rather than reimplemented here — a duplicated copy of that
// arithmetic would drift from the engine and quietly stop checking anything.
const req = createRequire(import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'maath/easing') {
      return { url: pathToFileURL(req.resolve('maath/easing/dist/maath-easing.cjs.js')).href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});

const { REGIONS } = await import('../src/lib/town/regions.ts');
const { boothOffsetsPx } = await import('../src/lib/town/three/city3d.ts');
const { PX_PER_UNIT } = await import('../src/lib/town/three/types.ts');
const { chessBoardRectPx } = await import('../src/lib/town/three/chessboard.ts');
const { checkersBoardRectPx, checkersBoothAnchorPx } = await import(
  '../src/lib/town/three/checkersboard.ts'
);
const { ZONE_SCALE } = await import('../src/lib/town/three/layout.ts');
const { beanNd } = await import('../src/lib/town/three/bean.ts');
const { allIslands, SEA_GAP } = await import('../src/lib/town/islands.ts');
const { beanShoreDist } = await import('../src/lib/town/three/bean.ts');

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const chess = REGIONS.find((r) => r.slug === 'chess-club');
if (!chess) fail('no chess-club region');

// --- 1. Do three booths fit? -----------------------------------------------
//
// makeShopBooth's widest element is the roof cone at radius bodyW * 0.92, with
// bodyW defaulting to 1.8 scene units.
const BODY_W = 1.8;
const ROOF_HALF_PX = BODY_W * 0.92 * PX_PER_UNIT;
const HIT_HALF_PX = BODY_W * 1.4 * 0.5 * PX_PER_UNIT;

// WING BOOTHS are not in the row. Cakey Checkers fronts the WEST arena, so it
// takes no plaza slot — but it must still be ON the land (region.games), or the
// game reads as unplaced and becomes unreachable from the town. Keep this list
// in sync with WING_BOOTHS in city3d.ts.
const WING = ['cakey-checkers'];
for (const w of WING) {
  if (!chess.games.includes(w)) {
    fail(`${w} is a chess-club wing booth but is no longer in its games[] — it would be unplaced`);
  }
}
const rowGames = chess.games.filter((g) => !WING.includes(g));

const offsets = boothOffsetsPx(chess, rowGames.length);
if (offsets.length !== rowGames.length) {
  fail(`boothOffsetsPx returned ${offsets.length} slots for ${rowGames.length} row games`);
}

const xs = offsets.map((o) => o.x).sort((a, b) => a - b);
let minGap = Infinity;
for (let i = 1; i < xs.length; i += 1) minGap = Math.min(minGap, xs[i] - xs[i - 1]);

const roofAir = minGap - 2 * ROOF_HALF_PX;
const hitAir = minGap - 2 * HIT_HALF_PX;

console.log(
  `Chess Island: ${rowGames.length} row booths + ${WING.length} wing on a ${chess.size.w}x${chess.size.h} rect`,
);
console.log(`  slot spacing     ${minGap.toFixed(1)} px`);
console.log(`  roof clear air   ${roofAir.toFixed(1)} px  (roof half-width ${ROOF_HALF_PX.toFixed(1)})`);
console.log(`  tap proxy air    ${hitAir.toFixed(1)} px`);

if (roofAir <= 40) fail(`booth roofs are ${roofAir.toFixed(1)}px apart — they will visually collide`);
if (hitAir <= 0) fail('booth tap proxies OVERLAP — a near-miss tap can enter the wrong game');

// --- 2. Is Chess Challenge still on the arena side? -------------------------
const arenaIdx = rowGames.indexOf('chess-challenge');
if (arenaIdx < 0) fail('chess-challenge is no longer in the chess-club booth row');
const arenaX = offsets[arenaIdx].x;
const eastmost = Math.max(...offsets.map((o) => o.x));
if (Math.abs(arenaX - eastmost) > 0.5) {
  fail(
    `chess-challenge sits at x=${arenaX.toFixed(1)} but the arena (eastmost) slot is ${eastmost.toFixed(1)}. ` +
      'Its booth is the entrance to the giant walk-on board east of the plaza — reorder games[] so it is LAST.',
  );
}
console.log(`  arena slot       chess-challenge at x=${arenaX.toFixed(1)} (eastmost) ok`);

// --- 3. Bearing ------------------------------------------------------------
//
// CHESS_SIZE must stay anchored at tile (0,0) with its centre vector parallel to
// (-4,-3), or the island stops sliding straight out and swings round the map.
//
// The world centre is tile (8,6), NOT WORLD_TILES/2 — the grid has since grown
// to 16x17 while the centre stayed pinned at the historical 16x12 middle. That
// is exactly why the "keep a 4:3 aspect" mnemonic in the CHESS_SIZE comment is
// now misleading: the real rule is w = 16 - 8k, h = 12 - 6k.
const WORLD_CENTER_TILES = { x: 8, y: 6 };
const cx = chess.tile.x + chess.size.w / 2;
const cy = chess.tile.y + chess.size.h / 2;
const bearing = (Math.atan2(cy - WORLD_CENTER_TILES.y, cx - WORLD_CENTER_TILES.x) * 180) / Math.PI;
console.log(`  bearing          ${bearing.toFixed(2)}°`);
if (Math.abs(bearing - -143.13) > 0.05) {
  fail(
    `bearing drifted to ${bearing.toFixed(2)}° (want -143.13°). CHESS_SIZE must stay anchored at (0,0) ` +
      'with w = 16 - 8k, h = 12 - 6k — 12x9 is the only legal growth step.',
  );
}

// --- 4. Is the walk-on board still on GRASS? -------------------------------
//
// The board sits at a FIXED pixel offset from the island centre while the
// island's size is a separate knob, so the two can drift apart silently. Past
// nd 0.82 the ground turns to sand and the arena visibly beaches itself — and
// nothing else in the build would notice.
const isle = allIslands().find((i) => i.id === 'chess-isle');
if (!isle) fail('chess-isle is no longer a solved island');
const rect = chessBoardRectPx({ x: 0, y: 0 });
let worstNd = 0;
for (const x of [rect.x0, rect.x1]) {
  for (const y of [rect.y0, rect.y1]) {
    worstNd = Math.max(worstNd, beanNd(0, 0, isle.halfW, isle.halfH, isle.pad, isle.stretch, x, y));
  }
}
const span =
  beanShoreDist(isle.halfW, isle.halfH, isle.pad, isle.stretch, 0) +
  beanShoreDist(isle.halfW, isle.halfH, isle.pad, isle.stretch, Math.PI);
console.log(`  island span     ${span.toFixed(0)} px`);
console.log(`  board far nd    ${worstNd.toFixed(3)} (grass line 0.82)`);
console.log(`  board share     ${(((rect.x1 - rect.x0) / span) * 100).toFixed(1)}% of the shoreline span`);
if (worstNd > 0.82) {
  fail(`the walk-on board's far corner is at nd ${worstNd.toFixed(3)} — it is beached on the sand.`);
}

// --- 4b. Is the WEST checkers arena on grass, and clear of the chess board? --
//
// Same drift risk as the eastern board, plus one more: the two arenas are
// positioned by independent fixed offsets, so nothing but this check stops them
// being moved into each other.
const cRect = checkersBoardRectPx({ x: 0, y: 0 });
let cWorstNd = 0;
for (const x of [cRect.x0, cRect.x1]) {
  for (const y of [cRect.y0, cRect.y1]) {
    cWorstNd = Math.max(cWorstNd, beanNd(0, 0, isle.halfW, isle.halfH, isle.pad, isle.stretch, x, y));
  }
}
console.log(`  checkers far nd ${cWorstNd.toFixed(3)} (grass line 0.82)`);
if (cWorstNd > 0.82) {
  fail(`the walk-on CHECKERS board's far corner is at nd ${cWorstNd.toFixed(3)} — it is beached.`);
}

// The plaza pad sits at the island centre; both arenas must clear it and each
// other. rect is the chess board (east), cRect the checkers board (west).
const arenaGap = rect.x0 - cRect.x1;
console.log(`  arena gap       ${arenaGap.toFixed(0)} px between the two boards`);
if (arenaGap <= 0) fail('the chess and checkers boards OVERLAP');
const padHalfW = (chess.size.w * PX_PER_UNIT * ZONE_SCALE) / 2;
if (cRect.x1 > -padHalfW) {
  fail(
    `the checkers board's east edge (${cRect.x1.toFixed(0)}) reaches into the plaza pad ` +
      `(half-width ${padHalfW.toFixed(0)}) — the pad's top face will bury the board's east rank.`,
  );
}
console.log(`  plaza clearance ${(-padHalfW - cRect.x1).toFixed(0)} px of grass west of the pad`);

// The checkers booth must stand between the pad and its board, not on either.
const anchor = checkersBoothAnchorPx({ x: 0, y: 0 });
if (anchor.x < cRect.x1 || anchor.x > -padHalfW) {
  fail(
    `the Cakey Checkers booth at x=${anchor.x.toFixed(0)} is not in the lane between ` +
      `the board (${cRect.x1.toFixed(0)}) and the plaza pad (${(-padHalfW).toFixed(0)}).`,
  );
}
console.log(`  checkers booth  x=${anchor.x.toFixed(0)} (fronting the west arena) ok`);

// --- 5. Open water between every pair of islands ----------------------------
const isles = allIslands();
let narrowest = Infinity;
for (let a = 0; a < isles.length; a += 1) {
  for (let b = a + 1; b < isles.length; b += 1) {
    const A = isles[a];
    const B = isles[b];
    const ang = Math.atan2(B.center.y - A.center.y, B.center.x - A.center.x);
    const water =
      Math.hypot(B.center.x - A.center.x, B.center.y - A.center.y) -
      beanShoreDist(A.halfW, A.halfH, A.pad, A.stretch, ang) -
      beanShoreDist(B.halfW, B.halfH, B.pad, B.stretch, ang + Math.PI);
    if (water < narrowest) narrowest = water;
    if (water <= 0) fail(`${A.id} and ${B.id} overlap — there is no water between them`);
  }
}
console.log(`  narrowest sea   ${narrowest.toFixed(0)} px (SEA_GAP ${SEA_GAP})`);

console.log('\nOK');
