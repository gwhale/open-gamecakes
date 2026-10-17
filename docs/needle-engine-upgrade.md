# Gamecakes World 2.0: Needle Engine upgrade

Status: foundation and isolated spike runtime implemented. Production rollout is
blocked until Needle 6 is stable and the full gameplay/performance gate passes.

## Run the spike

1. Set `NEXT_PUBLIC_ENABLE_NEEDLE_TOWN=1`.
2. Run `npm run dev`.
3. Open `/town?renderer=needle`.
4. Use `/town` to return to the legacy renderer.

The Needle runtime is copied from the pinned npm package into ignored generated
files under `public/needle/runtime` before development and production builds.
This avoids sending Needle's MaterialX/WASM modules through Next 16 Turbopack
and keeps the existing dynamic Next/Vercel application intact.

Importing `@needle-tools/engine` directly instead is not an option today —
`@needle-tools/materialx`, pulled in eagerly by `engine_modules.js`, resolves its
wasm payload with `fileURLToPath(new URL(dir + name, import.meta.url))`, which
Turbopack rejects as `Module not found: Can't resolve <dynamic>`.

`sync-runtime.mjs` walks the module graph from the minified entry and copies only
the transitive closure (~25 MB of 75 MB in `dist`, which ships every module in
three formats). It exits cleanly when the engine is not installed, so a missing
or unpublished alpha can never break a production build for gamecakes.org.

### Why the repo has an `.npmrc`

`three` is aliased to a **prerelease** (`0.185.2-alpha.1`). npm semver ranges skip
prereleases unless the range names one, so any ordinary `three` peer range — e.g.
`maath`'s `>=0.134.0` — fails to match and a cold `npm install` dies on
`ERESOLVE`. It does not reproduce against a warm `node_modules`, so it appears
only on CI/Vercel. `.npmrc` sets `legacy-peer-deps=true`; delete it if `three`
ever returns to a normally published version.

## How components reach the runtime

This is the part that is easy to get silently wrong.

Needle's `TypeStore` is a **module-scoped singleton** (`engine_typestore.ts`).
Because the runtime is self-hosted rather than bundled, a component class built
against the npm copy of the engine registers into a different `TypeStore` than
the one `<needle-engine>` consults — the GLB's component is then dropped with a
console-only `Unknown components in scene` warning, and nothing visibly fails.

So `GameDome` takes the engine module as an argument (`registerGameDome(engine)`)
and is registered against the same instance the element runs. Consequences worth
remembering:

- Types come from npm via `import type` (erased, pulls in no code); every runtime
  *value* comes from the passed-in module.
- It registers under the string literal `'GameDome'`, never `constructor.name` —
  class names do not survive production minification.
- Never use `instanceof` against npm `three` inside a component: the runtime
  bundles its own three, so the check is always false. Use three's `isX` flags
  (e.g. `material.isMeshStandardMaterial`), which exist for exactly this.
- Fields need no `@serializable` decorator. Needle's `assign()` runs with
  `onlyDeclared=false`, so every serialized key is applied — which is why the
  shared `tsconfig.json` needs no decorator settings.

The GLB carries the component in the `NEEDLE_components` glTF extension, not in
`extras`/`userData`. `npm run needle:validate` asserts the extension is declared,
that a `GameDome` is attached, and that its identity matches the manifest, so a
regression to an extras-only export fails the build instead of shipping a dome
that attaches nothing.

## Asset workflow

- `npm run needle:generate-spike` regenerates the placeholder Game Dome GLB.
- `npm run needle:validate` verifies its hash, node contract, mesh/material
  budgets, and file-size budget.
- Canonical Blender sources belong in `art/needle/library/`.
- Authored sources use Git LFS: `.blend`, `.ktx2`, `.hdr`, `.exr`, `art/**/*.glb`.
- Runtime scenes under `public/` are deliberately **not** in LFS. Vercel builds
  gamecakes.org straight from a master merge and does not fetch LFS objects, so
  an LFS-tracked file under `public/` would deploy as a ~130-byte pointer: the
  prebuild validator would fail its hash and every production deploy would break.
- Blender 4.5 LTS and `toktx >= 4.1` still need to be installed locally.

## Safety gates

- The default renderer is always the existing Three.js town.
- Needle requires both the environment flag and `?renderer=needle`.
- Initialization failure redirects to the legacy renderer without the flag.
- `npm run needle:gate:production` intentionally fails while Needle is a
  prerelease.
- The spike pins Needle's patched Three r185 build. All existing Three games
  must pass build, interaction, and visual regression before production.

## Remaining roadmap

- Refactor the current town engine to accept Needle's scene, renderer, camera,
  and frame lifecycle while preserving the `TownEngine` interface.
- Export the current static procedural environment, import it into Blender, and
  replace the placeholder dome with the authored prefab.
- Add interaction, environment, character, NPC, and camera components.
- Establish reference-device baselines and automated visual/performance tests.
- Add progressive loading, LOD, instancing, KTX2, mesh compression, and quality
  tiers before staged rollout.
