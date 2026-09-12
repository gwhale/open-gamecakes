// A local viewer for the treasure chests, on the real seabed.
//
//   npm run deep-harness    then open http://localhost:3031/
//
// WHY THIS EXISTS. /town/deep is gated on a family login and a Caramel Cove
// discovery row, so the only way to look at a chest used to be to log in as a
// child and dive. None of the questions worth asking about a chest need any of
// that: whether it sits on the sand, whether the lid hinges at the back, and
// whether you can tell open from shut across a stretch of water are all
// questions about geometry, and the geometry is built in the browser.
//
// It imports the SAME modules the dive does -- createChests, oceanFloorM,
// waterAtDepth -- so what you see here is what is down there. It is a viewer,
// not a second implementation, and it must stay that way: the moment it starts
// drawing its own idea of a chest it becomes a thing that can agree with you
// while the ocean disagrees.
//
// The chest seating bug (one corner two metres into a slope, on eight of the
// ten) was found here, in about a minute, having survived every test in the
// repo. src/lib/deep/chests.test.ts now pins it.

import * as THREE from 'three';
import { createChests } from '@/lib/deep/chests';
import { DEEP_CHESTS } from '@/lib/deep/chest-catalog';
import { oceanFloorM } from '@/lib/deep/ocean-floor';
import { waterAtDepth } from '@/lib/deep/biome';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(520, 400, false);
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 520 / 400, 0.1, 2000);

// Same lights as engine.ts.
const sun = new THREE.DirectionalLight(0xdff3ff, 1.1);
sun.position.set(0.4, 1, 0.2);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe9ff, 0x2b3f42, 0.9));
// The sub's headlights, so a canyon chest is not simply black.
const lamp = new THREE.PointLight(0xfff2d8, 2.2, 90, 1.4);
scene.add(lamp);

const fog = new THREE.FogExp2(0x38bdf8, 0.01);
scene.fog = fog;
scene.background = new THREE.Color(0x38bdf8);

// One seabed patch per chest, built from the real height field.
function terrainPatch(cx: number, cz: number, size = 90, seg = 90): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx;
    const z = p.getZ(i) + cz;
    p.setY(i, oceanFloorM(x, z));
  }
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0xc9b08a, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(cx, 0, cz);
  return mesh;
}
for (const c of DEEP_CHESTS) scene.add(terrainPatch(c.x, c.z));

// The real chests. Two sets are impossible (one catalog), so we build them shut
// and open individual lids on demand.
const chests = createChests(THREE, new Set<string>());
scene.add(chests.group);

const byslug = new Map(chests.all.map((h) => [h.slug, h]));

// Drive the lid animation to completion without waiting real time.
function settle(seconds = 2.5): void {
  for (let t = 0; t < seconds; t += 1 / 60) chests.update(1 / 60);
}

interface Shot {
  slug: string;
  open: boolean;
  dist: number;
  height: number;
  yaw: number;
  realFog: boolean;
}

(window as unknown as Record<string, unknown>).shoot = (opts: Shot): string => {
  const h = byslug.get(opts.slug)!;
  const c = DEEP_CHESTS.find((x) => x.slug === opts.slug)!;
  const depth = -oceanFloorM(c.x, c.z);

  if (opts.open) h.openInstantly();
  settle();

  // Water as the engine would paint it at this depth, or a clear look when we
  // are inspecting geometry rather than atmosphere.
  const look = waterAtDepth(depth);
  const col = new THREE.Color(opts.realFog ? look.water : 0x2a6f8f);
  fog.color.copy(col);
  (scene.background as THREE.Color).copy(col);
  fog.density = opts.realFog ? look.fogDensity : 0.004;

  const yaw = opts.yaw ?? 0;
  camera.position.set(
    h.position.x + Math.sin(yaw) * opts.dist,
    h.position.y + opts.height,
    h.position.z + Math.cos(yaw) * opts.dist,
  );
  camera.lookAt(h.position);
  lamp.position.copy(camera.position);

  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};

// Numbers worth having in text, not just in pixels.
(window as unknown as Record<string, unknown>).facts = (): string =>
  JSON.stringify(
    chests.all.map((h) => {
      const c = DEEP_CHESTS.find((x) => x.slug === h.slug)!;
      const floorY = oceanFloorM(c.x, c.z);
      return {
        slug: h.slug,
        depth: Number((-floorY).toFixed(1)),
        // How far the chest's ORIGIN sits above the sand directly beneath it.
        aboveFloor: Number((h.position.y - floorY).toFixed(2)),
      };
    }),
  );

// HARNESS-ONLY: reach past the public handle to shut a lid again, so the same
// chest on the same ground can be measured both ways. The real API is one-way
// on purpose (a chest never re-locks), so this cannot live in chests.ts.
function setOpen(slug: string, open: boolean): void {
  const g = chests.group.children.find((c) => c.name === 'Chest ' + slug)!;
  const pivot = g.children.find((c) => !(c as THREE.Mesh).isMesh)!;
  pivot.rotation.x = open ? -1.95 : 0;
}

/** How different an open chest looks from a shut one, at a given range. */
(window as unknown as Record<string, unknown>).compare = (slug: string, dist: number): string => {
  const h = byslug.get(slug)!;
  const c = DEEP_CHESTS.find((x) => x.slug === slug)!;
  const look = waterAtDepth(-oceanFloorM(c.x, c.z));
  const col = new THREE.Color(look.water);
  fog.color.copy(col);
  (scene.background as THREE.Color).copy(col);
  fog.density = look.fogDensity;

  camera.position.set(h.position.x + Math.sin(0.6) * dist, h.position.y + dist * 0.3, h.position.z + Math.cos(0.6) * dist);
  camera.lookAt(h.position);
  lamp.position.copy(camera.position);

  const grab = (): Uint8Array => {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = new Uint8Array(520 * 400 * 4);
    gl.readPixels(0, 0, 520, 400, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  setOpen(slug, false);
  const a = grab();
  setOpen(slug, true);
  const b = grab();
  setOpen(slug, false);

  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) diff++;
  }
  return JSON.stringify({ dist, diffPx: diff, pct: Number(((100 * diff) / (520 * 400)).toFixed(3)) });
};

(window as unknown as Record<string, unknown>).ready = true;
