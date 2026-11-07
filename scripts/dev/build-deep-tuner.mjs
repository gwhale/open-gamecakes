// Build a standalone HTML tuner for the Sunken Batterlands seabed + chest placement.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
//        scripts/dev/build-deep-tuner.mjs [out.html]
//
// WHY A GENERATOR AND NOT A HAND-WRITTEN PAGE — ocean-floor.ts opens by saying
// two copies of a seabed is two seabeds, "and the one you crash into would be
// the one you cannot see". A tuner with a transcribed copy of the terrain maths
// is exactly that second seabed, and it would drift the first time anyone
// retunes the real one.
//
// So the maths is not transcribed. Node's type-stripping blanks annotations to
// spaces in place, which means Function.prototype.toString() on an imported TS
// function hands back runnable JS of the function that actually ran. We
// serialise the REAL oceanFloorM, smooth, clamp, fieldNoise and cellSeed
// straight out of the loaded module and inline those.
//
// oceanFloorM reads its four depth anchors as free identifiers, so wrapping its
// body in a closure that supplies them is all it takes to make them sliders —
// without touching src/.
//
// Two module-private values (`ease`, `PHASE`) cannot be imported, so they are
// lifted out of the source text by regex. That is the one fragile step, and it
// is why this script ends with a PARITY CHECK: the assembled browser function is
// evaluated here against the real imported one over a grid, and the build fails
// loudly on any disagreement. A broken extraction can therefore produce a build
// error, never a map that quietly lies.

import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { oceanFloorM } from '@/lib/deep/ocean-floor';
import { smooth, clamp, parseSeed, WORLD_SEED } from '@/lib/deep/world-math';
import { fieldNoise, cellSeed } from '@/lib/deep/world-noise';
import { DEEP_CHESTS } from '@/lib/deep/chest-catalog';
import { BAND, DEPTH_LIMIT_M, DOMAIN_RADIUS_M, REEF_SPAWN, SONAR_RANGE_M } from '@/lib/deep/types';
import { BAKING_ITEMS } from '@/lib/items/catalog';

const out = process.argv[2] ?? 'scripts/dev/deep-tuner.html';
const floorSrc = readFileSync('src/lib/deep/ocean-floor.ts', 'utf8');
const noiseSrc = readFileSync('src/lib/deep/world-noise.ts', 'utf8');

// ---- 1. Lift the two module-private values we cannot import. ----
const grab = (src, re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('build-deep-tuner: could not find ' + what + ' — did the source move?');
  return m[1];
};
// REACH_M is display-only here, and landmarks.ts drags in chests.ts -> materials.ts
// -> `three`, which a bare worktree has no node_modules for. Lift the number.
const REACH_M = Number(
  grab(readFileSync('src/lib/deep/landmarks.ts', 'utf8'), /export const REACH_M = (\d+)/, 'REACH_M in landmarks.ts'),
);
const easeBody = grab(noiseSrc, /const ease = \(t: number\): number =>([^;]+);/, '`ease` in world-noise.ts');
const phaseExpr = grab(floorSrc, /const PHASE = ([^;]+);/, '`PHASE` in ocean-floor.ts');

// ---- 2. Serialise the real functions. Type annotations are already spaces. ----
const fnSrc = (f) => f.toString();
const bodyOf = (f) => {
  const s = fnSrc(f);
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
};

const MATH = [
  'const ease = (t) =>' + easeBody + ';',
  'const cellSeed = ' + fnSrc(cellSeed) + ';',
  'const fieldNoise = ' + fnSrc(fieldNoise) + ';',
  'const clamp = ' + fnSrc(clamp) + ';',
  'const smooth = ' + fnSrc(smooth) + ';',
  'const parseSeed = ' + fnSrc(parseSeed) + ';',
  '',
  '// The real oceanFloorM body, with its four depth anchors injected as a closure.',
  'function makeFloor(P) {',
  '  const REEF_DEPTH_M = P.REEF_DEPTH_M;',
  '  const SHELF_EDGE_M = P.SHELF_EDGE_M;',
  '  const CANYON_LIP_M = P.CANYON_LIP_M;',
  '  const CANYON_FLOOR_M = P.CANYON_FLOOR_M;',
  '  const DEEP_SEED = parseSeed(P.SEED);',
  '  const PHASE = ' + phaseExpr + ';',
  '  return function oceanFloorM(x, z) {' + bodyOf(oceanFloorM) + '};',
  '}',
].join('\n');

// ---- 3. PARITY CHECK — the assembled copy must equal the shipped function. ----
//
// `new Function` below is given source this repo just read off its own disk at
// build time, and its only output is a local HTML file. Nothing here runs in
// the app, serves a request, or sees user input. Do not extend it to accept
// anything that did not come out of src/.
// The four depth anchors are module-private, so they are read from the source
// rather than imported. They are NOT restated here: this file once carried its
// own copy of all four, the seabed was retuned, and the copy silently became a
// different ocean. The parity check below caught it, which is the only reason
// this comment is a note and not a bug report.
const anchor = (name) =>
  Number(grab(floorSrc, new RegExp('const ' + name + ' = (-?[\\d.]+);'), name + ' in ocean-floor.ts'));

const DEFAULTS = {
  REEF_DEPTH_M: anchor('REEF_DEPTH_M'),
  SHELF_EDGE_M: anchor('SHELF_EDGE_M'),
  CANYON_LIP_M: anchor('CANYON_LIP_M'),
  CANYON_FLOOR_M: anchor('CANYON_FLOOR_M'),
  DEPTH_LIMIT_M,
  DOMAIN_RADIUS_M,
  SEED: WORLD_SEED,
};
const built = new Function(MATH + '\nreturn makeFloor;')()(DEFAULTS);
let worst = 0;
let worstAt = null;
for (let i = 0; i < 90; i++) {
  for (let j = 0; j < 90; j++) {
    const x = -600 + (1200 * i) / 89;
    const z = -600 + (1200 * j) / 89;
    const d = Math.abs(built(x, z) - oceanFloorM(x, z));
    if (d > worst) { worst = d; worstAt = [x.toFixed(1), z.toFixed(1)]; }
  }
}
if (!(worst < 1e-9)) {
  throw new Error(
    'build-deep-tuner: PARITY CHECK FAILED. The extracted terrain disagrees with the ' +
      'shipped oceanFloorM by ' + worst.toExponential(3) + 'm at (' + worstAt + '). ' +
      'The extraction above is stale — fix it rather than shipping a map that lies.',
  );
}
// Sanity: the four anchors must actually still move the floor, or they have been
// inlined somewhere and the sliders would be decorative.
const moved = new Function(MATH + '\nreturn makeFloor;')()({ ...DEFAULTS, CANYON_FLOOR_M: 900 });
if (Math.abs(moved(0, 560) - built(0, 560)) < 1) {
  throw new Error('build-deep-tuner: CANYON_FLOOR_M no longer moves the seabed — sliders would be inert.');
}

const sha = execSync('git rev-parse --short HEAD').toString().trim();
const dirty = execSync('git status --porcelain src/lib/deep src/lib/items').toString().trim();

const DATA = {
  chests: DEEP_CHESTS.map((c) => ({ ...c })),
  bands: { reef: BAND.SPRINKLE_REEF, kelp: BAND.KELP_KITCHEN, canyon: BAND.CRUMB_CANYON },
  defaults: DEFAULTS,
  spawn: REEF_SPAWN,
  reachM: REACH_M,
  sonarM: SONAR_RANGE_M,
  items: BAKING_ITEMS.map((i) => ({ slug: i.slug, name: i.name, emoji: i.emoji })),
  sha,
  dirty: dirty ? dirty.split('\n').length : 0,
  builtAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
};

const html = readFileSync('scripts/dev/deep-tuner.template.html', 'utf8')
  .replace('/*__MATH__*/', () => MATH)
  .replace('/*__DATA__*/', () => JSON.stringify(DATA));

writeFileSync(out, html);
console.log('deep tuner  ->  ' + out);
console.log('  parity     max |delta| = ' + worst.toExponential(2) + 'm over 8100 samples');
console.log('  source     ' + sha + (DATA.dirty ? '  (' + DATA.dirty + ' uncommitted file(s) in deep/items)' : ''));
console.log('  chests     ' + DEEP_CHESTS.length + '   items ' + BAKING_ITEMS.length);
