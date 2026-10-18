/**
 * Every runtime GLB under public/models/ must meet a budget.
 *
 *   npm run check:models
 *
 * Tests cannot see geometry, but they can see what a model COSTS and whether
 * it stands on the ground. Those are measured here on the shipped file, not on
 * the script that made it — a check on the edit passes on nonsense.
 *
 * Budgets are tablet-first: the town runs on a kid's iPad, and every land can
 * be a castle, so per-asset draw calls multiply across the map. A file with no
 * entry gets DEFAULT_BUDGET; anything that genuinely needs more gets a named
 * override with the reason beside it.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { measureModel } from './measure-model.mjs';

const MODELS_DIR = 'public/models';

/** What a static, palette-atlas prop may cost. */
export const DEFAULT_BUDGET = {
  bytes: 150_000,
  drawCalls: 1,
  materials: 1,
  triangles: 3_000,
  textures: 2,
  texturePx: 256,
  grounded: true,
};

/** Keyed by path relative to public/models/. */
export const BUDGET_OVERRIDES = {
  // Built for the Needle spike, not by an art/blender script: its Needle
  // component looks up the named HighlightTarget node, so it cannot be joined.
  'town/game-dome.glb': { drawCalls: 4, materials: 4 },
  // art/blender/chest.py: the lid swings on a hinge at runtime, so it is its
  // own node (ChestLid) beside ChestBody. One shared atlas, two draws.
  'town/chest.glb': { drawCalls: 2 },
  // art/blender/cupcake.py: not a prop but a parts library — every base, face,
  // hat, pair of glasses and topping the Cakey Store sells, one node each
  // (avatar.ts assembles a kid's cupcake from 6-14 of them). The file is
  // loaded once per page and shared by every cupcake on it, so the totals
  // here are a one-off download, not a per-instance cost.
  'cupcake/cupcake.glb': { drawCalls: 37, bytes: 560_000, triangles: 18_000 },
  // art/blender/cakey.py: the mascot, and there is exactly one of him in the
  // town, so his cost never multiplies across the map. He is the one model a
  // kid walks right up to, so his tiers carry rounded edges, frosting drips and
  // piped borders that a box-built Cakey read as "plain primitives" without
  // (~5,400 tris). His rig and six clips are another ~26 KB of the bytes.
  'town/cakey.glb': { bytes: 280_000, triangles: 6_000 },
};

const GROUND_EPS = 0.01;

export function violations(m, budget) {
  const out = [];
  const over = (label, value, cap) => {
    if (value > cap) out.push(`${label} ${value.toLocaleString()} > ${cap.toLocaleString()}`);
  };
  over('bytes', m.bytes, budget.bytes);
  // Each tint slot is one more primitive by design (see gamecakes.py).
  const tints = m.tintSlots ?? 0;
  over('draw calls', m.drawCalls, budget.drawCalls + tints);
  over('materials', m.materials, budget.materials + tints);
  over('triangles', m.triangles, budget.triangles);
  over('textures', m.textures.length, budget.textures);
  for (const t of m.textures) over(`texture ${t.name} px`, Math.max(...t.size), budget.texturePx);
  if (budget.grounded && Math.abs(m.baseY) > GROUND_EPS) {
    out.push(`base Y ${m.baseY.toFixed(3)} — not standing on the ground`);
  }
  return out;
}

async function listGlbs(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.glb'))
    .map((e) => path.join(e.parentPath, e.name));
}

async function main() {
  const files = await listGlbs(MODELS_DIR);
  let failed = 0;
  for (const file of files.sort()) {
    const key = path.relative(MODELS_DIR, file).split(path.sep).join('/');
    const budget = { ...DEFAULT_BUDGET, ...BUDGET_OVERRIDES[key] };
    let problems;
    let m;
    try {
      m = await measureModel(file);
      problems = violations(m, budget);
    } catch (e) {
      problems = [e instanceof Error ? e.message : String(e)];
    }
    if (problems.length) {
      failed++;
      console.error(`FAIL ${key}`);
      for (const p of problems) console.error(`     ${p}`);
    } else {
      console.log(
        `ok   ${key}  ${m.drawCalls} draw / ${m.materials} mat${m.tintSlots ? ` (${m.tintSlots} tint)` : ''} / ${m.triangles} tris / ${(m.bytes / 1024).toFixed(0)} KB`,
      );
    }
  }
  for (const key of Object.keys(BUDGET_OVERRIDES)) {
    if (!files.some((f) => path.relative(MODELS_DIR, f).split(path.sep).join('/') === key)) {
      console.error(`FAIL override for ${key} names a file that does not exist — remove it`);
      failed++;
    }
  }
  if (failed) {
    console.error(`\n${failed} model(s) over budget. Measure one with scripts/assets/inspect-model.mjs.`);
    process.exit(1);
  }
}

await main();
