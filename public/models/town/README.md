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
- Keep them small — this is a tablet-first game. Prefer a few thousand triangles
  and one material over a faithful hero model.
- Textures: prefer vertex colours or a single small atlas. KTX2 needs `toktx`,
  which is not set up yet.

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
| `land-cottage.glb` | Land level 1, via the registry | 290 tris, 6 materials, apex 2.9u |
| `land-tower.glb` | Land level 2, via the registry | 898 tris, 8 materials, apex 9.3u |
| `land-castle.glb` | Land level 3, via the registry | 2,602 tris, 9 materials, apex 18u |

All three are Blender-authored **reference assets** — they exist to prove the
round trip and give correct-by-construction starting `.blend` files. Replace them
with real art; deleting any one file restores that stage's procedural builder
with no code change.

| `game-dome.glb` | Beside the cookie-corner word-memory booth | First authored asset in the town. Scenery only — the procedural booth still owns the tap target. |
