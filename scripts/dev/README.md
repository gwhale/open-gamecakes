# Dev tools for the Sunken Batterlands

Two local instruments for the one part of this repo the test suite is worst at
seeing: the shape of a 3D world. Neither ships. Neither is imported by the app.

Both exist because of a pattern that has now cost this project several defects —
a test that measures the EDIT you made rather than the SHAPE that results will
pass on nonsense. A submarine moored on sand, a cove with no hollow, and eight
chests buried in slopes all went out through green tests and a production build,
and every one of them was found by a person looking at the thing.

---

## `npm run tuner` — the seabed and chest-placement tuner

Generates `deep-tuner.html` (gitignored) and tells you where it put it. Open it
in any browser.

A top-down depth map with contours and band edges, a cross-section that follows
the cursor, and a live chest table. Six sliders for the constants that actually
decide chest placement — the four depth anchors in `ocean-floor.ts`, plus
`DEPTH_LIMIT_M` and `DOMAIN_RADIUS_M` from `types.ts` — and a field for the world
seed. Drag a chest to move it; press **Show diff** for paste-ready source edits.

The Checks panel mirrors `chest-catalog.test.ts`, so anything red here is red in
CI too.

### It does not own a copy of the terrain maths

This is the whole design of the generator, and the reason it is a generator
rather than a page.

`ocean-floor.ts` opens by warning that two copies of a seabed is two seabeds,
*"and the one you crash into would be the one you cannot see."* A tuner with a
transcribed copy of the maths is exactly that second seabed, and it would drift
the first time anyone retuned the real one.

So nothing is transcribed. Node's `--experimental-strip-types` blanks type
annotations to spaces **in place**, which means `Function.prototype.toString()`
on an imported TypeScript function hands back runnable JavaScript of the
function that actually ran. The generator serialises the real `oceanFloorM`,
`smooth`, `clamp`, `fieldNoise` and `cellSeed` straight out of the loaded
modules. `oceanFloorM` reads its four depth anchors as free identifiers, so
wrapping its body in a closure that supplies them is all it takes to make them
sliders, without touching `src/`.

Two module-private values (`ease`, `PHASE`) and the four anchor defaults cannot
be imported and are lifted out of the source text by regex. That is the fragile
step, so **the build ends with a parity check**: the assembled function is
evaluated against the real one over 8,100 points and the build FAILS on any
disagreement. It has already earned this — the anchors were once restated in the
generator, the seabed was retuned, and the check refused to build rather than
shipping a map that lied by 36 metres.

If you change the shape of `ocean-floor.ts`, the failure you get is a build
error naming the value it could not find. Fix the extraction; do not weaken the
check.

---

## `npm run deep-harness` — the chest and water viewer

Serves a page at `http://localhost:3031/` that renders the real chests on the
real seabed with the engine's own lights, fog and per-depth water.

`/town/deep` is gated on a family login and a Caramel Cove discovery row, so
looking at a chest otherwise means logging in as a child and diving. The gate
guards ENTRY; it has nothing to do with the geometry, which is built in the
browser from modules this page imports directly.

It exposes two functions on `window` for driving from a headless browser:

- `shoot({ slug, open, dist, height, yaw, realFog })` → a PNG data URL
- `compare(slug, dist)` → how much of the frame changes when the lid opens,
  which is a usable number for "can you tell open from shut at this range"
  (measured: 14% at 8 m, 2.5% at 16 m, 0.8% at 28 m, nothing by 70 m — against
  an interaction range of 16 m)

The seating defect that `src/lib/deep/chests.test.ts` now pins was found here.
