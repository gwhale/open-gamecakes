// The sea surface, from underneath and from on top.
//
//   npm run deep-harness    then open http://localhost:3031/water.html
//
// Surfacing is the one moment in the dive that cannot be checked from a test
// and is awkward to reach in the real thing: you have to own Caramel Cove, dive,
// and drive all the way back up. This puts the real water-surface.ts in front of
// a camera at any depth, including above the waterline.
//
// It builds the same scene the engine does — same fog, same per-depth water
// look from biome.ts, same seabed — so what shows up here is what is out there.

import * as THREE from 'three';
import { createWaterSurface } from '@/lib/deep/water-surface';
import { oceanFloorM } from '@/lib/deep/ocean-floor';
import { waterAtDepth } from '@/lib/deep/biome';

const W = 560;
const H = 400;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2200);

const sun = new THREE.DirectionalLight(0xdff3ff, 1.1);
sun.position.set(0.4, 1, 0.2);
scene.add(sun);
const ambient = new THREE.HemisphereLight(0xbfe9ff, 0x2b3f42, 0.9);
scene.add(ambient);

const fog = new THREE.FogExp2(0x38bdf8, 0.01);
scene.fog = fog;
scene.background = new THREE.Color(0x38bdf8);

const water = createWaterSurface(THREE);
scene.add(water.mesh);

// A patch of real seabed under the camera, for scale and for something for the
// caustics to read against.
const SEA_X = 0;
const SEA_Z = -420;
const patch = new THREE.PlaneGeometry(420, 420, 120, 120);
patch.rotateX(-Math.PI / 2);
{
  const p = patch.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, oceanFloorM(p.getX(i) + SEA_X, p.getZ(i) + SEA_Z));
  }
  patch.computeVertexNormals();
}
const bed = new THREE.Mesh(
  patch,
  new THREE.MeshStandardMaterial({ color: 0xc9b08a, roughness: 1 }),
);
bed.position.set(SEA_X, 0, SEA_Z);
scene.add(bed);

// Something solid at the waterline, so "above" and "below" are unmistakable.
const buoy = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 20, 14),
  new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.6 }),
);
buoy.position.set(SEA_X + 14, -1.2, SEA_Z + 6);
scene.add(buoy);

interface Shot {
  /** Camera height in metres, NEGATIVE below the waterline. */
  y: number;
  /** Where the camera looks, in metres relative to its own position. */
  pitch: number;
  time: number;
  /** Depth handed to water.update — what the sub would report. */
  depth: number;
}

(window as unknown as Record<string, unknown>).shoot = (o: Shot): string => {
  const look = waterAtDepth(Math.max(0, o.depth));
  const col = new THREE.Color(look.water);
  fog.color.copy(col);
  (scene.background as THREE.Color).copy(col);
  fog.density = look.fogDensity;
  ambient.intensity = look.ambient;
  sun.intensity = look.ambient * 0.9;

  water.update(o.time, Math.max(0, o.depth), col, SEA_X, SEA_Z);

  camera.position.set(SEA_X, o.y, SEA_Z + 46);
  camera.lookAt(SEA_X, o.y + o.pitch, SEA_Z);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};

(window as unknown as Record<string, unknown>).ready = true;
