# Authored town art

Blender-authored `.glb` models loaded into the existing Three.js town by
`src/lib/town/three/authored-model.ts`, using three's own `GLTFLoader`.

**No Needle runtime is involved here.** Needle's value for this project is the
authoring pipeline and its editor; putting its (currently alpha) runtime in the
render path of a game kids play every day is a separate, much larger decision.
Authored art does not require it — a `.glb` is a `.glb`.

## Dropping in a new asset

1. Export from Blender as **glTF Binary (`.glb`)**, +Y up, applied transforms.
2. Commit it here. Scale does not need to match the town: the loader normalises
   to a target height and re-seats the model so its base sits on the ground, so
   you position by ground point instead of chasing the artist's origin.
3. Load it, keeping it additive and failure-tolerant — a decorative asset must
   never be able to take the town down:

```ts
loadAuthoredModel(THREE, '/models/town/thing.glb', { targetHeightU: 2.4 })
  .then((model) => { /* position, scene.add, keep the handle to dispose */ })
  .catch((e) => console.warn('[town] authored model failed to load:', e));
```

4. Dispose it in the engine's `dispose()`. `model.dispose()` walks the tree and
   releases geometries, materials and textures.

## Rules

- **Not Git LFS.** `.gitattributes` deliberately excludes `public/**/*.glb`:
  Vercel does not fetch LFS objects, so an LFS-tracked file under `public/`
  deploys as a ~130-byte pointer. Keep runtime models small enough for plain git.
- Keep them small: this is a tablet-first game. `npm run check:models` (in CI)
  enforces 1 draw call, 1 material (plus one of each per tint slot), 3,000
  triangles and 150 KB per file unless
  `scripts/assets/check-models.mjs` names an override.
- Textures: one small palette atlas, which the Blender pipeline generates
  (`art/blender/README.md`). KTX2 needs `toktx`, which is not set up yet.

## Swap-in assets (no code change needed)

Some models are looked up by **key** through `authored-registry.ts`. Drop a file
at `public/models/town/<key>.glb` and it is used automatically; delete it and the
procedural builder returns. Keys and their required heights live in
`AUTHORED_LAND_STRUCTURES` (`src/lib/town/three/land-structure.ts`):

| Key | Replaces | Height |
|---|---|---|
| `land-cottage` | Land evolution level 1 | 2.9u |
| `land-tower` | Land evolution level 2 | 9.3u |
| `land-castle` | Land evolution level 3 | 18u |
| `booth`, `region-arch`, `hero-cake`, `tree-lollipop`, `gumdrop`, `wafer` | Repeated land elements (`AUTHORED_PROPS` in `authored-registry.ts`) | see `art/blender/README.md` |

These are **preloaded once and cloned**, because land structures are rebuilt
synchronously when a kid upgrades their land and cannot await a fetch. Clones
share geometry and materials with the cached original, so **never dispose what
the registry hands you** — `buildLandStructure` returns empty disposal arrays for
authored models precisely so the existing teardown is a safe no-op.

Blender sources, the headless export command and the conventions live in
`art/blender/README.md`. Inspect any model the way the loader sees it:

```bash
node scripts/assets/inspect-model.mjs public/models/town/land-cottage.glb
```

## Current contents

| File | Used by | Notes |
|---|---|---|
| `land-cottage.glb` | Land level 1, via the registry | 234 tris, 1 draw call, apex 2.9u |
| `land-tower.glb` | Land level 2, via the registry | 898 tris, 1 draw call, apex 9.3u |
| `land-castle.glb` | Land level 3, via the registry | 2,602 tris, 1 draw call, apex 18u |

All three are Blender-authored **reference assets** — they exist to prove the
round trip and give correct-by-construction starting `.blend` files. Replace them
with real art; deleting any one file restores that stage's procedural builder
with no code change.

| `game-dome.glb` | Beside the cookie-corner word-memory booth | First authored asset in the town. Scenery only — the procedural booth still owns the tap target. |
| `cakey.glb` | Cakey, the mascot NPC | Rigged: one skinned mesh (1,240 tris, 1 draw call), bones `root body top hat arm.L arm.R leg.L leg.R`, clips `Idle Walk Wave Celebrate Think Oops`. Model scale (the runtime applies Cakey's 1.9x). No face, shadow disc or tap box: the runtime adds those. Source `art/blender/cakey.py`. |
