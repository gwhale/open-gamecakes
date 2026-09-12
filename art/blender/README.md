# Blender sources for Gamecakes town art

Editable `.blend` files and the Python scripts that build/export them. Nothing
here ships — the runtime only ever loads the `.glb` files these produce, which
live in `public/models/town/`.

## The loop

```bash
BLENDER="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"

# Build, export, render a preview, and save the .blend — all headless.
"$BLENDER" --background --factory-startup --python art/blender/land-cottage.py
"$BLENDER" --background --factory-startup --python art/blender/land-tower.py
"$BLENDER" --background --factory-startup --python art/blender/land-castle.py

# Check what the town's loader will actually see.
node scripts/assets/inspect-model.mjs public/models/town/land-castle.glb
```

## `gamecakes.py`

Shared helpers so the asset scripts read as modelling rather than boilerplate:
the palette, `material()`, primitive wrappers (`box` / `cyl` / `cone` / `ball` /
`cherry` / `crenellate`), `export_glb()`, `render_preview()` and `save_blend()`.

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

Or open the `.blend` in Blender, model by hand, and export manually with the
settings below. The script exists so the asset is reproducible and so an agent
can iterate without a GUI — not because assets must be scripted.

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

## Conventions

- **Sit the model on Z=0** and centre it on X/Y. The loader re-seats and centres,
  but starting correct means the preview tells you the truth.
- **Match the target height.** Land structures must hit the apex of the
  procedural silhouette they replace — Cottage 2.9u, Tower 9.3u, Castle 18u.
  These are asserted in `AUTHORED_LAND_STRUCTURES` and covered by tests.
- **Match the palette.** `PALETTE` in `gamecakes.py` mirrors `FROSTING` in
  `src/lib/town/three/land-structure.ts`. Authored art sits beside procedural
  pieces that are not replaced yet, so a drifting palette shows immediately.
- **Tablet-first budget.** A few thousand triangles and a handful of materials.
  The cottage is 290 triangles / 6 materials. Solid colours beat textures — the
  town's whole look is flat candy shading with no bloom pass.
- **Faceted, not smooth.** Shade-smooth only genuinely round parts (cherries,
  bands). The town is deliberately low-poly faceted.

## Sizing gotcha

`primitive_cube_add(size=1)` gives a **half-extent of 0.5**, and `scale`
multiplies that — so `scale=(2.2, 1.8, 1.15)` is a box 2.2 × 1.8 × 1.15 overall.
Getting this backwards is what produced the first broken cottage.

## Naming

The GLB filename **is** the registry key: `public/models/town/<key>.glb` where
`<key>` comes from `AUTHORED_LAND_STRUCTURES` in `land-structure.ts`. Drop a file
named `land-tower.glb` in and the Tower stage starts using it — no code change.
Delete it and the procedural builder comes back.

`.blend` files are Git LFS-tracked (`.gitattributes`). The exported `.glb` under
`public/` deliberately is **not** — Vercel does not fetch LFS objects.
