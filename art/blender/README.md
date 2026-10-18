# Blender sources for Gamecakes town art

Editable `.blend` files and the Python scripts that build/export them. Nothing
here ships — the runtime only ever loads the `.glb` files these produce, which
live in `public/models/town/`.

## The loop

```bash
# Blender 5.2 LTS (supported to July 2028). Every device uses the same LTS so
# the scripts and the .blend files stay readable everywhere.
BLENDER="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"

# Build, save the .blend, join into the shipped form, export, render a preview
# — all headless.
"$BLENDER" --background --factory-startup --python art/blender/land-cottage.py
"$BLENDER" --background --factory-startup --python art/blender/land-tower.py
"$BLENDER" --background --factory-startup --python art/blender/land-castle.py

# Check what the town's loader will actually see, then the budgets CI enforces.
node scripts/assets/inspect-model.mjs public/models/town/land-castle.glb
npm run check:models

# See it the way the town lights it -> art/look/land-castle.png
npm run preview:model -- public/models/town/land-castle.glb
```

## `gamecakes.py`

Shared helpers so the asset scripts read as modelling rather than boilerplate:
the palette, `material()`, primitive wrappers (`box` / `cyl` / `cone` / `ball` /
`cherry` / `crenellate`), `join_with_palette()`, `export_glb()`,
`render_preview()`, `save_blend()`, and `ship()`, which runs the whole tail of
an asset script in the right order.

The primitive wrappers take **full dimensions and a world centre**, which is the
opposite of Blender's own convention and deliberately so — see the sizing gotcha
below.

## The three land structures

| Script | Asset | Apex | Silhouette it must read as |
|---|---|---|---|
| `land-cottage.py` | `land-cottage.glb` | 2.9u | Squat, wide, cozy |
| `land-tower.py` | `land-tower.glb` | 9.3u | Tall, slender, tapering, candy-cane roof + pennant |
| `land-castle.py` | `land-castle.glb` | 18u | Broad multi-tower keep: motte, curtain wall, four spires |

The three must stay **instantly distinguishable from across the map** — that is
the whole point of the evolution ladder. A kid should know their stage at a
glance, so keep the proportions far apart, not just the details.

## The land elements

The repeated pieces of every land, each modelled to the dimensions of the code
version it replaces in `src/lib/town/three/city3d.ts` (keys and heights in
`AUTHORED_PROPS`, `authored-registry.ts`). Whatever is text or a sprite (sign
names, glyph beacons, the arch marquee) stays in code.

| Script | Replaces | Apex | Tint slots |
|---|---|---|---|
| `booth.py` | `makeShopBooth` body, roof, door | 2.55u | `tint` = land ribbon colour (and its approach glow) |
| `region-arch.py` | `makeRegionArch` posts, beam, keystone | 5.96u | `tint` = ribbon, `tint2` = deep ribbon (cane stripes) |
| `hero-cake.py` | the generic two-tier hero cake | 1.45u | `tint` = region theme colour |
| `tree-lollipop.py` | scattered lollipop trees (56) | 1.77u | `tint` = canopy candy colour |
| `gumdrop.py` | scattered gumdrops | 0.48u | `tint` = gumdrop colour |
| `wafer.py` | scattered wafer biscuits | 0.146u | none |
| `tree-cotton-candy.py` | build piece `cotton-tree` (kids place it) | 2.1u | none |
| `tree-gumdrop-pine.py` | build piece `gumdrop-pine` | 2.0u | none |
| `tree-cane-palm.py` | build piece `cane-palm` | 2.2u | none |
| `tree-mint-puff.py` | build piece `tree` | 1.6u | none |
| `build-fence.py` | build piece `fence` | 0.574u | none |
| `build-flowers.py` | build piece `flowers` | 0.46u | none |
| `build-lamp.py` | build piece `lamp` | 1.465u | `tint` = the bulb; `builds3d.ts` swaps in its glowing material |
| `build-bench.py` | build piece `bench` | 0.62u | none |
| `build-house.py` | build piece `house` | 1.159u | none |

Build pieces are drawn instanced (`builds3d.ts`): each GLB mesh becomes one
InstancedMesh, so keep them single-material where you can (the lamp's bulb is
the one tint slot, because the atlas cannot glow). Every kind but the road is
Blender art; a missing file falls back to that kind's code shape, or to the
plain build tree. The build tray's turntable preview (`turntable-stage.ts`)
loads the same GLB. A brand-new kind also means a `town_builds.kind` migration
(see 0065).

### Tint slots

One model serves every land, so the parts that change colour per land are
modelled **white** in a material named exactly `tint` or `tint2`
(`gc.tint("tint")`). `join_with_palette()` keeps each as its own material slot
instead of baking it into the atlas, and the registry swaps in a coloured copy
by that name at runtime (`applyTints`), one shared copy per colour. Each slot
is one more draw call, and `check:models` allows exactly one per slot. The look
preview paints them with a sample pink so they do not render white.

Or open the `.blend` in Blender, model by hand, and export manually with the
settings below. The script exists so the asset is reproducible and so an agent
can iterate without a GUI — not because assets must be scripted.

## What ships: one mesh, one material

Scripts model with one Blender material per colour, because that is the
readable way to build. `ship()` then saves the `.blend` (so the editable source
keeps its named parts) and `join_with_palette()` collapses the scene into **one
mesh with one material**:

- every distinct (colour, roughness) pair becomes a 16px swatch in a generated
  64x64 atlas (sRGB base colour, plus a Non-Color roughness image in the G
  channel, glTF's metallicRoughness layout);
- every face's UVs point at the centre of its swatch;
- all meshes are joined with transforms applied, and the empties are dropped.

Before this the castle was 78 meshes and 9 materials, i.e. ~78 draw calls for
every castle on the map. It is now one. Swatches are power-of-two aligned, so
mipmaps keep each one a pure colour down to 1px; colours only mix when the
whole asset is a couple of pixels on screen. The atlas holds 16 swatches, and
`join_with_palette()` refuses to export more.

Hand-modelling works the same way: use one material per colour while you
work, and the join does the rest.

## Cakey: the rigged one

`cakey.py` keeps the procedural mascot's silhouette from
`src/lib/town/three/cakey.ts` (tier footprints, heights, palette) but models
him as a decorated cake: rounded tiers with a slight bulge and crumb wobble, a
frosting cap per tier with drips, piped bead borders, rosettes and sprinkles.
All of it is swept from one rounded-rectangle outline (`rrect()`), so caps,
drips and borders line up with the tiers by construction. It joins with
`join_with_palette()`, then rigs and animates.

- **The face plane sits at three z = 0.30** in front of the vanilla tier.
  Nothing modelled behind it may come further forward, so the vanilla cap has
  no drips across the face and the bead border under the mouth sits flush.
- **He has his own `check:models` budget** (one instance in the whole town,
  seen at the closest zoom): about 5,400 triangles and 250 KB.
Order matters: each part gets a vertex group named after its bone *before* the
join (groups survive joining), and the armature is added *after* it.

- **Bones and clip names are a contract with the runtime.** Bones `root, body,
  top, hat, arm.L, arm.R, leg.L, leg.R`; clips `Idle, Walk, Wave, Celebrate,
  Think, Oops`. Rename one and the runtime silently plays nothing.
- **Poses are written in world axes** (`rot_x`, `rot_y`, `aim(bone, direction)`)
  and converted to bone-local space in `apply_pose()`, so "arm up and out"
  means that regardless of bone roll. Every sampled frame keys every bone, so
  loops close exactly and nothing leaks between clips.
- **Raised arms stretch** (`REACH`, 1.35x along the bone). His arms are 0.2u
  nubs; without the stretch a wave never clears the bottom tier.
- The `.blend` is saved after rigging, so it opens as the animation source:
  add or adjust an Action there, keep the name, re-export.

## The cupcake: a parts library

`cupcake.py` is every kid's player character, and every kid's is different, so
it ships as one GLB of **parts** (`public/models/cupcake/cupcake.glb`), not one
model: each base, frosting, collar, face feature, pair of glasses, hat and
topping the Cakey Store sells is its own node, 29 in all.
`buildCupcakeModel` (`src/lib/town/three/avatar.ts`) clones the ones a kid's
config names and places them by the same anchors the code-built cupcake used.

- **Node names are a contract** with `CUPCAKE_PART_NAMES`; a test reads the
  shipped GLB and fails if the two lists differ.
- **Each node's origin is its attach point** (a body's base, a hat's brim, the
  spot a topping rests on). The parts are spread out on a sheet in the .blend;
  `_join_groups` pivots carry them home and the runtime zeroes each clone's
  position.
- **Tint slots mean different things per part**: paper and band on a wrapper or
  sponge, the icing on frosting, colour and shade on a hat, the frame on
  glasses. The runtime paints a private copy per cupcake.
- More than 16 colours, so it uses an 8-column atlas (`atlas_cols=8`).
- `check:models` gives it its own budget: it is loaded once per page and
  shared by every cupcake on it.

## The water normal map

`water-normals.py` is not a model: it bakes `public/textures/town/water-normal.png`,
the tiling ripple texture on the town's sea (`engine.ts`, the water material).
Waves come from Blender's Ocean modifier, an FFT ocean that is periodic over its
tile, so the map has no seam. It is then low-passed into rounded swells and given
a soft tanh crest profile, so it reads as glaze rather than chop. The knobs
(`WIND`, `ALIGNMENT`, `CUTOFF`, `FROSTING`, `STRENGTH`) are constants at the top
of the script, and `water-normals-preview.png` shows a lit 2x2 tiling, so a seam
or an obvious repeat is visible before it ships.

## The land normal maps

`land-normals.py` bakes `grass-normal.png`, `sand-normal.png` and
`path-normal.png` into `public/textures/town/`: buttercream tufts, brown-sugar
wind ripples, and frosting combed along the trails. Blender's Noise and Voronoi
don't repeat, so the node trees sample them in 4D on a flat torus
(`cos 2πu, sin 2πu, cos 2πv` with `W = sin 2πv`), which makes opposite edges
identical. Cycles bakes the fields; numpy shapes them into height and normals.
The ground blends grass and sand per vertex (`aSand` in `engine.ts`), and
`pathRibbonGeo` in `materials.ts` keeps the combing at its proportions on any
trail length. `land-normals-preview.png` shows all three lit and tiled 2x2.

## Two previews, two jobs

`<asset>-preview.png` (Cycles, rendered by the script) is the **geometry** check
below. `art/look/<asset>.png` (`npm run preview:model`) is the **look** check: three's
own GLTFLoader, ACES tone mapping and the town's light rig and pastel IBL,
imported from `src/lib/town/three/lighting.ts` rather than copied, so it cannot
drift from the game. Four turntable angles, then one tile per animation clip.
Judge colour and gloss there, never in the Cycles render. Ground and sky are
stand-ins, and anything drawn at runtime (Cakey's face) is absent. Re-run it and
commit the PNG whenever an asset changes, so the PR diff shows the change.

## Why the preview render matters

`land-cottage.py` renders `land-cottage-preview.png` next to the `.blend`. That
is not decoration: a broken model exports a perfectly valid GLB of exactly the
right byte count, and every automated check passes. The first version of the
cottage had a roof twice the width of its body, a door floating half a unit off
the front wall, and the whole building hovering above the ground — all invisible
until something rendered it.

The preview includes a **ground plane at Z=0** specifically so you can see
whether the model sits on the ground. It is added after the export, so it can
never leak into the GLB.

## Export settings that matter

| Setting | Value | Why |
|---|---|---|
| Format | **glTF Binary (`.glb`)** | One file, no sidecar textures |
| `+Y Up` | **on** | Blender is Z-up, glTF/three is Y-up. **Do not hand-rotate to compensate** — let the exporter convert, or the model lands on its side |
| Apply Modifiers | on | Bakes modifiers and object scale |
| Cameras / Lights | **off** | Preview-only objects must not ship |
| Backface culling | **on** (set on the atlas material) | Parts are closed shapes; without it the exporter marks the material `doubleSided` |

## Conventions

- **Sit the model on Z=0** and centre it on X/Y. The loader re-seats and centres,
  but starting correct means the preview tells you the truth.
- **Match the target height.** Land structures must hit the apex of the
  procedural silhouette they replace — Cottage 2.9u, Tower 9.3u, Castle 18u.
  These are asserted in `AUTHORED_LAND_STRUCTURES` and covered by tests.
- **Match the palette.** `PALETTE` in `gamecakes.py` mirrors `FROSTING` in
  `src/lib/town/three/land-structure.ts`. Authored art sits beside procedural
  pieces that are not replaced yet, so a drifting palette shows immediately.
- **Tablet-first budget, enforced.** `npm run check:models` (run in CI) holds
  every GLB under `public/models/` to 1 draw call, 1 material, 3,000 triangles,
  150 KB and a base at Y=0, unless `scripts/assets/check-models.mjs` names an
  override with a reason. The cottage is 234 triangles. Flat swatch colours,
  not painted textures — the town's look is flat candy shading with no bloom pass.
  The one exception is lighting, not colour: cake buildings (lands, heroes,
  booths) get a sponge-crumb normal projected at runtime (`addCakeRelief` in
  `materials.ts`) on their matte parts and tint slots. Keep frosting, candy and
  windows at roughness 0.5 or below and they stay smooth; cake walls at about
  0.7 get crumb. Nothing to model or export for it.
- **Faceted, not smooth.** Shade-smooth only genuinely round parts (cherries,
  bands). The town is deliberately low-poly faceted.

## Sizing gotcha

`primitive_cube_add(size=1)` gives a **half-extent of 0.5**, and `scale`
multiplies that — so `scale=(2.2, 1.8, 1.15)` is a box 2.2 × 1.8 × 1.15 overall.
Getting this backwards is what produced the first broken cottage.

## Naming

The GLB filename **is** the registry key: `public/models/town/<key>.glb` where
`<key>` comes from `AUTHORED_LAND_STRUCTURES` in `land-structure.ts`,
`AUTHORED_HEROES` or `AUTHORED_PROPS` in `authored-registry.ts`. Drop a file
named `land-tower.glb` in and the Tower stage starts using it — no code change.
Delete it and the procedural builder comes back.

The town builds every land once, synchronously, so the host loads this art
**before** creating the engine (`preloadTownArt`, capped at 4 s). Anything
still loading after the cap stays procedural until the next visit.

`.blend` files are Git LFS-tracked (`.gitattributes`). The exported `.glb` under
`public/` deliberately is **not** — Vercel does not fetch LFS objects.
