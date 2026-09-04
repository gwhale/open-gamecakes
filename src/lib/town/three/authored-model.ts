// Loading Blender-authored GLB art into the existing Three.js town.
//
// The town builds every mesh procedurally in code, which is why it reads as
// code-built. This is the seam for replacing that a piece at a time with real
// authored art, WITHOUT putting a third-party runtime in the render path: it is
// three's own GLTFLoader dropping models into the scene the town already owns.
//
// Two conventions from the rest of the engine are kept:
//   1. No top-level `three` import — GLTFLoader is imported lazily inside the
//      loader, so it never enters the town's initial chunk (or the server
//      bundle) and is only fetched when an authored asset is actually used.
//   2. Callers own disposal. Every load returns a dispose() that walks the tree
//      and releases geometries, materials and textures.

import type * as THREE from 'three';

export interface AuthoredModel {
  /** Root object, ready to position and add to the scene. */
  root: THREE.Object3D;
  /** Size of the model's bounding box AFTER any normalisation, in scene units. */
  sizeU: { x: number; y: number; z: number };
  /** Releases every geometry, material and texture the model brought with it. */
  dispose(): void;
}

export interface LoadAuthoredModelOptions {
  /**
   * Scale the model uniformly so it stands this tall in scene units. Authored
   * assets arrive at whatever scale the artist worked in — normalising here
   * means Blender units never have to match the town's, so nobody has to
   * remember a magic scale factor per asset.
   */
  targetHeightU?: number;
  /**
   * Recentre so the model's base sits at y=0 and it is centred on x/z, letting
   * callers position it by ground point rather than by wherever the artist
   * happened to leave the origin. Defaults to true.
   */
  groundAndCentre?: boolean;
}

/**
 * Uniform scale that makes something `currentHeight` tall become
 * `targetHeight` tall. Returns 1 for degenerate input rather than 0/Infinity,
 * so a flat or empty asset can never collapse or explode the scene.
 */
export function uniformScaleForHeight(currentHeight: number, targetHeight: number): number {
  if (!Number.isFinite(currentHeight) || currentHeight <= 0) return 1;
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) return 1;
  return targetHeight / currentHeight;
}

/** Duck-typed so it works across three module instances (see isX flags). */
interface Disposable {
  dispose?: () => void;
}

function disposeMaterial(material: unknown): void {
  if (!material || typeof material !== 'object') return;
  // Release textures hanging off the material before the material itself.
  for (const value of Object.values(material as Record<string, unknown>)) {
    if (
      value &&
      typeof value === 'object' &&
      (value as { isTexture?: boolean }).isTexture === true
    ) {
      (value as Disposable).dispose?.();
    }
  }
  (material as Disposable).dispose?.();
}

/** Walks a loaded tree releasing every GPU resource it owns. */
export function disposeAuthoredTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as unknown as {
      geometry?: Disposable;
      material?: unknown;
    };
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) disposeMaterial(m);
    } else if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  });
}

/**
 * Loads a GLB and returns it ready to place.
 *
 * Rejects on network/parse failure — callers are expected to catch and carry
 * on, because a missing decorative asset must never take the town down with it.
 */
export async function loadAuthoredModel(
  THREE_NS: typeof THREE,
  url: string,
  options: LoadAuthoredModelOptions = {},
): Promise<AuthoredModel> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;

  const box = new THREE_NS.Box3().setFromObject(root);
  const size = new THREE_NS.Vector3();
  box.getSize(size);

  if (options.targetHeightU !== undefined) {
    const scale = uniformScaleForHeight(size.y, options.targetHeightU);
    root.scale.setScalar(scale);
    box.setFromObject(root);
    box.getSize(size);
  }

  if (options.groundAndCentre !== false) {
    // Re-measure after scaling, then shift so the base rests on y=0 and the
    // footprint is centred — callers position by ground point, not by origin.
    const centre = new THREE_NS.Vector3();
    box.getCenter(centre);
    root.position.x -= centre.x;
    root.position.z -= centre.z;
    root.position.y -= box.min.y;
  }

  return {
    root,
    sizeU: { x: size.x, y: size.y, z: size.z },
    dispose: () => disposeAuthoredTree(root),
  };
}
