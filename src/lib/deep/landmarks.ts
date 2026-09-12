// The things worth finding: one sunken whisk, and one glow you cannot reach.
//
// Two objects is the whole content budget of this branch, on purpose. The point
// of the slice is whether driving and pinging FEEL right; five discoveries
// would test content instead, and would have to be re-authored once the
// controls change. When persistence and the journal land, this file grows.
//
// No runtime `three` import; caller owns disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { GLOW_DEPTH_M, GLOW_SPOTS } from './types';
import { glowSprite } from '@/lib/town/three/materials';
import { MARK_SECONDS } from './sonar';
import { findChest } from './chest-catalog';
import { createChests } from './chests';
import type { SonarContact } from './sonar';

/** How close the sub must be for the interact prompt to appear (metres). */
export const REACH_M = 16;

export interface Landmark {
  id: string;
  /** Shown when the kid is close enough to interact. */
  prompt: string;
  position: THREE.Vector3;
  contact: SonarContact;
}

export interface Landmarks {
  group: THREE.Group;
  all: Landmark[];
  /** Sonar contacts, in the shape sonar.ts wants. */
  contacts: SonarContact[];
  /** Nearest landmark within REACH_M of a point, or null. */
  nearest(p: THREE.Vector3): Landmark | null;
  /** Swing a chest's lid. No-op for a slug that is not a chest, or one that is
   *  already open. */
  openChest(slug: string): void;
  update(dt: number, t: number): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

export function createLandmarks(
  THREE: ThreeNS,
  /** Slugs this kid has already opened. Those chests start open, so a found
   *  one reads differently from across the reef without any marker system. */
  found: ReadonlySet<string> = new Set(),
): Landmarks {
  const group = new THREE.Group();
  group.name = 'Landmarks';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const all: Landmark[] = [];

  // ---------------------------------------------------------------------
  // The chests. Ten of them, one per baking item, spread down the three bands.
  // ---------------------------------------------------------------------
  // Position, slug, echo and prompt all come from the dependency-free catalog,
  // so the API route that validates a find and the mesh that IS the find can
  // never disagree about what exists.
  //
  // The whisk used to be the only one, hand-built and lying half-buried on the
  // reef. It is now the chest it comes out of, under the same slug -- the kids
  // have rows under 'sunken-whisk' and renaming it would re-lock a find they
  // already made.
  const chests = createChests(THREE, found);
  group.add(chests.group);
  chests.geometries.forEach((g) => geometries.push(g));
  chests.materials.forEach((m) => materials.push(m));

  // Ping halos -- dark until sonar touches them, then lit for MARK_SECONDS.
  // This is the only feedback that a return corresponds to a real thing.
  interface Marked { halo: ReturnType<typeof glowSprite>; mark: number }
  const marked: Marked[] = [];

  for (const chest of chests.all) {
    const spec = findChest(chest.slug)!;
    const halo = glowSprite(THREE, 0x86efac, 9, 0);
    halo.sprite.position.copy(chest.position);
    group.add(halo.sprite);
    textures.push(halo.tex);
    materials.push(halo.mat);
    const m: Marked = { halo, mark: 0 };
    marked.push(m);

    all.push({
      id: spec.slug,
      prompt: spec.prompt,
      position: chest.position.clone(),
      contact: {
        id: spec.slug,
        echo: spec.echo,
        position: chest.position.clone(),
        onPing: () => {
          m.mark = MARK_SECONDS;
        },
      },
    });
  }

  // ---------------------------------------------------------------------
  // The glow. Below DEPTH_LIMIT_M and above the canyon floor, so it is visible
  // from the wall and permanently out of reach. It is the last thing the slice
  // shows and the only thing it promises.
  //
  // There are SEVERAL, spread along the canyon. There was one at first, and
  // driving out to the wall proved why that fails: the canyon is hundreds of
  // metres wide, so a kid who reaches the depth limit anywhere else gets the
  // refusal with nothing underneath it — all wall, no promise. Several also
  // says something the single one could not, which is that there is a whole
  // lit world down there rather than one object.
  // ---------------------------------------------------------------------
  const glows: Array<{ mat: THREE.SpriteMaterial; light: THREE.PointLight }> = [];
  for (const [gx, gz] of GLOW_SPOTS) {
    const glowPos = new THREE.Vector3(gx, -GLOW_DEPTH_M, gz);
    const glow = glowSprite(THREE, 0x7dd3fc, 62, 0.5);
    // Exempt from fog. Everything else in the canyon is correctly swallowed at
    // ~90m, and that swallowed these too: standing at the depth limit, the one
    // thing the whole dive is FOR was a uniform navy rectangle. A light in dark
    // water is also the one thing that genuinely does carry — sediment dims a
    // lit surface, it does not dim the source. So the murk stays honest and the
    // glow shines through it.
    glow.mat.fog = false;
    glow.mat.needsUpdate = true;
    glow.sprite.position.copy(glowPos);
    group.add(glow.sprite);
    textures.push(glow.tex);
    materials.push(glow.mat);

    // A dim point light so the canyon floor around each is faintly modelled —
    // a bare sprite in black water reads as a UI element rather than a place.
    const glowLight = new THREE.PointLight(0x7dd3fc, 900, 260, 2);
    glowLight.position.copy(glowPos);
    group.add(glowLight);
    glows.push({ mat: glow.mat, light: glowLight });
  }

  // Deliberately NOT sonar contacts. Sonar would give them a range and a
  // bearing, which turns "what IS that" into "an objective 180m southeast".
  // You are supposed to see them with your eyes and be told no.

  const tmp = new THREE.Vector3();

  return {
    group,
    all,
    contacts: all.map((l) => l.contact),
    geometries,
    materials,
    textures,

    openChest(slug: string) {
      chests.all.find((c) => c.slug === slug)?.open();
    },

    nearest(p: THREE.Vector3): Landmark | null {
      let best: Landmark | null = null;
      let bestDist = REACH_M;
      for (const l of all) {
        const d = tmp.copy(l.position).distanceTo(p);
        if (d < bestDist) {
          bestDist = d;
          best = l;
        }
      }
      return best;
    },

    update(dt: number, t: number) {
      chests.update(dt);
      for (const m of marked) {
        if (m.mark > 0) {
          m.mark = Math.max(0, m.mark - dt);
          // Ease out over the last second so the mark dies rather than blinking.
          m.halo.mat.opacity =
            0.85 * Math.min(1, m.mark) * (0.75 + Math.sin(t * 6) * 0.25);
        } else if (m.halo.mat.opacity !== 0) {
          m.halo.mat.opacity = 0;
        }
      }
      // They breathe, slowly, and OUT OF PHASE with each other — a shared
      // pulse would read as one system blinking rather than as several things
      // that happen to be alive down there.
      glows.forEach(({ mat, light }, i) => {
        const phase = t * 0.7 + i * 1.7;
        mat.opacity = 0.4 + Math.sin(phase) * 0.14;
        light.intensity = 780 + Math.sin(phase) * 220;
      });
    },
  };
}
