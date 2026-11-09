# Third-party code

Gamecakes is MIT licensed (see `LICENSE`). This file records code in this
repository that originates elsewhere, so anyone forking the project inherits the
attribution along with the code.

---

## ABYSSAL: The Living Deep

- **Upstream:** https://github.com/emollick/abyssal-living-deep
- **Original:** ABYSSAL by Davi (Token-Gremlin)
- **Licence:** MIT — Copyright (c) 2026 Davi (Token-Gremlin)

The Sunken Batterlands (`src/lib/deep/`) is built on procedural ocean work from
ABYSSAL. Upstream is vanilla ES-module JavaScript on stock three.js + Vite;
everything below was converted to TypeScript and to this repo's module
conventions (no runtime `three` import — the namespace is passed in).

| File here | Upstream | Relationship |
|---|---|---|
| `src/lib/deep/world-noise.ts` | `src/underwater/WorldNoise.js` | **Ported.** The hash and interpolation are unchanged — the exact bit-mixing *is* the function. |
| `src/lib/deep/world-math.ts` | `src/underwater/WorldMath.js`, `src/underwater/OceanDomain.js` | **Ported:** `seeded`, `parseSeed`, `clamp`, `smooth`. |
| `src/lib/deep/ocean-floor.ts` | `src/underwater/OceanDomain.js` (`oceanFloor`) | **Derived.** The composition is upstream's — blend shelf / shelf-break / trench with smoothsteps, then layer swells, dunes, a sand channel and relief. All constants are re-derived for a 430 m world. |

### What was deliberately not taken

`UnderwaterMaterial.js` was the obvious candidate and is not usable here: it
imports `core/SharedUniforms`, `ocean/OceanCouplingGLSL` and
`ocean/OceanSampleGLSL`, and reads a reef shadow map and a caustic slope
texture. Taking it means taking ABYSSAL's whole renderer, which is both a much
larger fork than this feature justifies and heavier than the tablet these games
are played on. Depth is carried by three's built-in exponential fog instead.

Also not taken: the fauna stack (`OceanFauna`, `MarineLife`, `FaunaGeometry`,
`AnimalMotion`, `BiomeWildlife`), the guided-tour systems (`Expedition`,
`WildlifeWatch`, `FieldNotes`), and `OceanSound`. Several of these are strong
candidates for a later branch — creatures especially, since the PRD asks to
reuse the procedural fauna system wherever practical.
