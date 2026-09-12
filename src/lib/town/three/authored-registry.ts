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
}

export interface AuthoredRegistry {
  /** Resolves once every preload has settled (loaded or failed). */
  ready: Promise<void>;
  /**
   * Synchronous. Returns a fresh clone, or `null` when the asset is missing,
   * failed, or has not finished loading — which is the whole point: callers
   * fall back to their procedural builder and the town looks the same.
   */
  take(key: string): THREE.Object3D | null;
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
        // Set shadow flags once on the original; clones inherit them.
        model.root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
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
    take(key) {
      const model = loaded.get(key);
      if (!model || disposed) return null;
      // clone() shares geometry + material with the original by design.
      return model.root.clone(true);
    },
    dispose() {
      disposed = true;
      for (const model of loaded.values()) model.dispose();
      loaded.clear();
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
