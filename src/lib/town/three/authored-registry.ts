// Preload-and-clone registry for authored GLB art.
//
// #262 shipped a one-shot loader for decorative props. That shape does not work
// for anything the town REBUILDS at runtime — land structures are torn down and
// rebuilt synchronously every time a kid upgrades their land
// (`city3d.ts` → `setLandLevel`), with a pop-in tween. You cannot await a
// network fetch in the middle of that.
//
// So: preload every authored asset once, then hand out `.clone()`s synchronously.
//
// DISPOSAL CONTRACT — the one thing to get right:
//   Clones SHARE geometries and materials with the cached original (that is what
//   makes them cheap). Disposing a clone would therefore break every other
//   instance and the cache itself. Callers must NOT dispose what `take()`
//   returns — the registry owns those resources and frees them in dispose().
//   `buildLandStructure` upholds this by returning EMPTY geometry/material
//   arrays for authored structures, so the existing teardown loops become
//   no-ops without needing to know any of this.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { loadAuthoredModel, type AuthoredModel } from './authored-model';
import { addCakeRelief, cakeReliefTex, cloneMaterial } from './materials';

export interface AuthoredAssetSpec {
  /** Stable lookup key, e.g. 'land-cottage'. */
  key: string;
  /** Public URL, e.g. '/models/town/land-cottage.glb'. */
  url: string;
  /**
   * Height in scene units the asset is normalised to. For land structures this
   * MUST match the procedural silhouette it replaces, because the caller stands
   * the structure at scale 1 and positions around its known height.
   */
  targetHeightU?: number;
  /** A cake building: give its matte parts sponge-crumb relief (addCakeRelief). */
  relief?: boolean;
}

/** Material names of the tint slots (TINT_SLOTS in art/blender/gamecakes.py). */
const TINT_SLOT_NAMES = { tint: true, tint2: true } as const;

/** Colours for an asset's tint slots, by slot name (see TINT_SLOTS in
 *  art/blender/gamecakes.py): `tint` is the main one, `tint2` the second. */
export interface Tints {
  tint?: number;
  tint2?: number;
}

/**
 * Paints the tint slots of a freshly taken clone. Tint parts are modelled white
 * in a material named exactly `tint` / `tint2`; each is swapped for a coloured
 * copy from `cache`, so 40 trees in 4 colours share 4 materials instead of
 * owning 40. The cache's materials belong to whoever owns the cache.
 */
export function applyTints(root: THREE.Object3D, tints: Tints, cache: Map<string, THREE.Material>): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const slot = mesh.material.name as keyof Tints;
    const hex = tints[slot];
    if (hex === undefined) return;
    const cacheKey = `${mesh.material.uuid}:${hex}`;
    let painted = cache.get(cacheKey);
    if (!painted) {
      const copy = cloneMaterial(mesh.material) as THREE.MeshStandardMaterial;
      copy.color.setHex(hex);
      painted = copy;
      cache.set(cacheKey, painted);
    }
    mesh.material = painted;
  });
}

export interface AuthoredRegistry {
  /** Resolves once every preload has settled (loaded or failed). */
  ready: Promise<void>;
  /**
   * Synchronous. Returns a fresh clone, or `null` when the asset is missing,
   * failed, or has not finished loading — which is the whole point: callers
   * fall back to their procedural builder and the town looks the same.
   *
   * `tints` colours the asset's tint slots. The painted materials are shared
   * and owned by the registry like everything else a clone holds.
   */
  take(key: string, tints?: Tints): THREE.Object3D | null;
  /** True when the asset loaded and `take()` will succeed. */
  has(key: string): boolean;
  /** Frees the cached originals. Invalidates every outstanding clone. */
  dispose(): void;
}

export function createAuthoredRegistry(
  THREE_NS: ThreeNS,
  specs: AuthoredAssetSpec[],
): AuthoredRegistry {
  const loaded = new Map<string, AuthoredModel>();
  const painted = new Map<string, THREE.Material>();
  // Loaded only when some asset asks for it; owned and disposed here.
  const relief = specs.some((s) => s.relief) ? cakeReliefTex(THREE_NS) : null;
  let disposed = false;

  const ready = Promise.all(
    specs.map(async (spec) => {
      try {
        const model = await loadAuthoredModel(THREE_NS as unknown as typeof THREE, spec.url, {
          targetHeightU: spec.targetHeightU,
        });
        if (disposed) {
          model.dispose();
          return;
        }
        // Set shadow flags (and relief) once on the original; clones inherit them.
        model.root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (spec.relief && relief && !Array.isArray(mesh.material)) {
              // A tint slot is the building's painted wall, so it is all cake.
              addCakeRelief(mesh.material, relief, mesh.material.name in TINT_SLOT_NAMES);
            }
          }
        });
        loaded.set(spec.key, model);
      } catch {
        // Absent or broken authored art is the NORMAL state until an artist has
        // made it. Stay quiet at info level and let the caller fall back.
        if (process.env.NODE_ENV !== 'production') {
          console.info(`[town] no authored asset for "${spec.key}" — using procedural.`);
        }
      }
    }),
  ).then(() => undefined);

  return {
    ready,
    has: (key) => loaded.has(key),
    take(key, tints) {
      const model = loaded.get(key);
      if (!model || disposed) return null;
      // clone() shares geometry + material with the original by design.
      const clone = model.root.clone(true);
      if (tints) applyTints(clone, tints, painted);
      return clone;
    },
    dispose() {
      disposed = true;
      for (const model of loaded.values()) model.dispose();
      loaded.clear();
      // Copies share the original's textures (none, for a white tint), so only
      // the material objects themselves are released here.
      for (const mat of painted.values()) mat.dispose();
      painted.clear();
      relief?.dispose();
    },
  };
}

/**
 * Fixed hero landmarks that an authored GLB may replace, keyed by region slug.
 *
 * `targetHeightU` matches the procedural landmark it stands in for, because
 * city3d places the hero group and everything around it — plinth balloons, the
 * arch gate, the land marquee — assuming that silhouette's size.
 *
 * Deliberately NOT here:
 *   * per-kid lands — the hero is that kid's own cupcake, assembled at runtime
 *     from their CupcakeConfig, so no fixed mesh can represent it;
 *   * the generic 2-tier cake — it is tinted per region by themeColor.
 */
export const AUTHORED_HEROES: Record<string, { key: string; targetHeightU: number }> = {
  'chess-club': { key: 'hero-chess-club', targetHeightU: 2.26 },
  'race-victory-lane': { key: 'hero-race-victory-lane', targetHeightU: 1.8 },
};

/** Region slugs whose hero may be swapped for authored art. */
export const AUTHORED_HERO_SLUGS: ReadonlySet<string> = new Set(Object.keys(AUTHORED_HEROES));

/**
 * Land elements built in Blender (art/blender/<key>.py), each replacing a piece
 * city3d.ts otherwise builds in code. Heights equal the authored size, which
 * was modelled to the code piece's dimensions, so they load at scale 1 and
 * every offset around them (signs, beacons, sway pivots) still lines up.
 */
export const AUTHORED_PROPS = {
  /** makeShopBooth's body, roof and door. `tint` = the land's ribbon colour. */
  booth: { key: 'booth', targetHeightU: 2.55 },
  /** makeRegionArch's posts, beam and keystone. `tint` = ribbon, `tint2` = deep ribbon. */
  arch: { key: 'region-arch', targetHeightU: 5.96 },
  /** The generic two-tier hero cake. `tint` = the region's theme colour. */
  heroCake: { key: 'hero-cake', targetHeightU: 1.45 },
  /** Scattered lollipop tree. `tint` = canopy candy colour. */
  tree: { key: 'tree-lollipop', targetHeightU: 1.768 },
  /** Scattered gumdrop. `tint` = gumdrop colour. */
  gumdrop: { key: 'gumdrop', targetHeightU: 0.48 },
  /** Scattered wafer biscuit. No tint. */
  wafer: { key: 'wafer', targetHeightU: 0.146 },
} as const satisfies Record<string, { key: string; targetHeightU: number }>;

/** Build pieces drawn from Blender art, by build kind: every kind but the
 *  road, which joins up from a centre patch and arms at runtime. Heights are
 *  in grid squares (one square = one scene unit). A missing file draws the
 *  kind's code shape in builds3d.ts, or the plain build tree for kinds that
 *  never had one. The build tray's turntable shows these same models. */
export const AUTHORED_BUILDS = {
  fence: { key: 'build-fence', targetHeightU: 0.574 },
  flowers: { key: 'build-flowers', targetHeightU: 0.46 },
  /** `tint` is the bulb; builds3d swaps in its glowing bulb material. */
  lamp: { key: 'build-lamp', targetHeightU: 1.465 },
  bench: { key: 'build-bench', targetHeightU: 0.62 },
  tree: { key: 'tree-mint-puff', targetHeightU: 1.6 },
  house: { key: 'build-house', targetHeightU: 1.159 },
  'cotton-tree': { key: 'tree-cotton-candy', targetHeightU: 2.1 },
  'gumdrop-pine': { key: 'tree-gumdrop-pine', targetHeightU: 2.0 },
  'cane-palm': { key: 'tree-cane-palm', targetHeightU: 2.2 },
} as const satisfies Record<string, { key: string; targetHeightU: number }>;

/** The treasure chest (art/blender/chest.py), shared with the deep. Two nodes:
 *  `ChestBody` and `ChestLid`, the lid's origin on its hinge. About a cupcake
 *  tall, because the land's three are meant to be hard to spot. */
export const AUTHORED_CHEST = { key: 'chest', targetHeightU: 0.6 } as const;

/** The rental jet ski (art/blender/jetski.py), the ride itself, and the shore
 *  dock it moors at (art/blender/jetski-dock.py). Both load at authored size:
 *  the ski's saddle height is `seatOffsetU` in vehicles.ts, and the dock's deck
 *  top is JETSKI_DECK_TOP_U in the engine. No code fallback: a missing file
 *  means no docks and no jet skis, never a primitive stand-in. */
export const AUTHORED_JETSKI = { key: 'jetski', targetHeightU: 0.678 } as const;
export const AUTHORED_JETSKI_DOCK = { key: 'jetski-dock', targetHeightU: 2.87 } as const;
// The jet ski playground (art/blender/slalom-buoy.py, slalom-arrow.py, ski-ramp.py).
// The ramp is scaled up from its 0.893u authored height; engine.ts reads the
// same ratio to know how long and how high the deck is.
export const AUTHORED_SLALOM_BUOY = { key: 'slalom-buoy', targetHeightU: 1.18 } as const;
export const AUTHORED_SLALOM_ARROW = { key: 'slalom-arrow', targetHeightU: 1.08 } as const;
export const AUTHORED_SKI_RAMP = { key: 'ski-ramp', targetHeightU: 1.25 } as const;

/**
 * Waits for a registry to load, but never longer than `maxWaitMs`. The town is
 * built once, synchronously, from whatever has loaded by then — so this is
 * what decides whether a kid sees the Blender art or the code fallback on
 * first load. Anything slower than the cap stays procedural for the session
 * rather than holding the town on a loading screen.
 */
export async function settleRegistry(registry: AuthoredRegistry, maxWaitMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    registry.ready,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, maxWaitMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}
