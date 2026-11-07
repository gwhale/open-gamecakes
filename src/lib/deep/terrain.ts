// The seabed mesh — one displaced grid over the whole bowl.
//
// TECHNIQUE PORTED from abyssal-living-deep `src/underwater/OceanTerrain.js`
// (`floorTile`, MIT — see THIRD-PARTY.md): build the grid in WORLD coordinates
// (not local + transform), derive normals ANALYTICALLY by sampling the height
// function either side of each vertex, and bake the depth tint into vertex
// colours. Upstream needs that so its streamed detail tiles meet seamlessly;
// we get a cheaper benefit from the same trick — no normal-computation pass,
// and terrain that agrees exactly with the collision clamp, because both call
// oceanFloorM() rather than one reading a mesh the other guessed at.
//
// WHY ONE MESH AND NOT CHUNKS. Upstream streams 7x7 tiles around the camera
// because its world is 5km wide. Ours is 1.2km and drowned in fog that closes
// at 62-170m, so the whole bowl at 8m resolution is ~52k triangles in a single
// draw call — comfortably inside an iPad's budget, and it deletes the entire
// chunk-lifecycle problem (pop-in, seams, disposal bookkeeping). If profiling
// ever says otherwise, the fix is fewer SEGMENTS before it is chunking.
//
// No runtime `three` import — the namespace arrives as an argument, and the
// caller owns disposal of everything in the returned `geometries`/`materials`.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { DOMAIN_RADIUS_M } from './types';
import { oceanFloorM } from './ocean-floor';
import { waterAtDepth } from './biome';

/** Grid resolution across the bowl. 160 => ~7.8m quads. The single knob to
 *  turn if the tablet complains: 120 costs almost nothing visually under fog. */
const SEGMENTS = 160;
/** Span of the generated grid. A little past the domain radius so the walls of
 *  the world are never the edge of the geometry. */
const SPAN_M = DOMAIN_RADIUS_M * 2 + 120;

export interface DeepTerrain {
  mesh: THREE.Mesh;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Build the seabed. Vertex-coloured and lit by the scene's own lights, so the
 * depth tint from biome.ts and the sub's headlights land on the same surface
 * without a custom shader.
 */
export function createTerrain(THREE: ThreeNS): DeepTerrain {
  const stride = SEGMENTS + 1;
  const count = stride * stride;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const indices = new Uint32Array(SEGMENTS * SEGMENTS * 6);

  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const origin = -SPAN_M / 2;
  const step = SPAN_M / SEGMENTS;
  let cursor = 0;

  for (let j = 0; j <= SEGMENTS; j++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const k = j * stride + i;
      const x = origin + i * step;
      const z = origin + j * step;
      const y = oceanFloorM(x, z);
      positions.set([x, y, z], k * 3);

      // Analytic normal: the height field is continuous, so the gradient is
      // just two central differences. Cheaper and smoother than
      // computeVertexNormals(), and exact at the grid edges where that fails.
      n.set(
        oceanFloorM(x - 0.4, z) - oceanFloorM(x + 0.4, z),
        0.8,
        oceanFloorM(x, z - 0.4) - oceanFloorM(x, z + 0.4),
      ).normalize();
      normals.set([n.x, n.y, n.z], k * 3);

      // Depth tint, plus a faint sinusoidal mottle so flat sand still reads as
      // a surface with something on it rather than a solid fill.
      c.setHex(waterAtDepth(-y).seabed).multiplyScalar(
        0.93 + Math.sin(x * 0.09) * Math.cos(z * 0.11) * 0.05,
      );
      colors.set([c.r, c.g, c.b], k * 3);

      if (i < SEGMENTS && j < SEGMENTS) {
        indices.set([k, k + stride, k + 1, k + 1, k + stride, k + stride + 1], cursor);
        cursor += 6;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();

  // Lambert, not Standard: the seabed is matte sand and rock with no highlight
  // worth computing, and this is by far the biggest surface in the scene.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Seabed';
  // The bowl is always around us; culling it costs a bounding-sphere test to
  // conclude "yes, still there".
  mesh.frustumCulled = false;

  return { mesh, geometries: [geo], materials: [mat] };
}
