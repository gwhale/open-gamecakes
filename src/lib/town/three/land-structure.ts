// Evolved-land structures — the building that grows on a per-kid land as it is
// upgraded in the Cakey Store (Cottage → Tower → Castle). Level 0 (Plot) has no
// structure; the kid's cupcake alone sits on the pedestal, so the FIRST upgrade
// reads as a real, dramatic change.
//
// Each stage is a COMPLETELY DIFFERENT silhouette AND meaningfully bigger than
// the last, so a kid can tell the stage from across the map:
//   • Cottage — wide, low, cozy: a squat cake body under a broad pitched roof
//     (apex ≈ 2.9u).
//   • Tower   — tall + slender: a single tapering cake spire with a candy-cane
//     roof and a pennant (apex ≈ 9.3u).
//   • Castle  — a magnificent multi-tower cake keep: a tiered motte, four corner
//     spires, a curtain wall, and a central keep whose apex reaches ≈ 18u — over
//     3× the arch gate it replaces as the land's hero.
//
// Heights are baked NATIVELY into the geometry (NOT via the pad's padScale) so
// the Castle towers regardless of footprint scaling — the caller (city3d.ts)
// stands the structure at the land's back edge at scale 1.
//
// No runtime `three` import — the namespace arrives as an arg (see types.ts). We
// build plain THREE groups and hand back geometries/materials for the caller to
// track + dispose, exactly like buildCupcakeModel does.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import type { AuthoredRegistry } from './authored-registry';

/** Gamecakes frosting palette (mirrors castle.ts) — structures alternate
 *  frosting colors by layer so they read as stacked cake. */
const FROSTING = {
  strawberry: 0xfb7185,
  mint: 0x6ee7b7,
  vanilla: 0xfde68a,
  cream: 0xfff1d6,
  chocolate: 0xb5764a,
} as const;
const CHERRY_RED = 0xe11d48;
const ROOF_PINK = 0xf472b6;
const DOOR_BROWN = 0x8b5e3c;

export interface LandStructure {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Authored replacements for the three silhouettes below. Drop a matching GLB
 * into `public/models/town/` and it is used automatically; until then the
 * procedural builder runs and the town looks exactly as it does today.
 *
 * `targetHeightU` MUST match the procedural apex, because the caller stands the
 * structure at scale 1 and positions around its known height (see the comment
 * at the `buildLandStructure` call site in city3d.ts).
 */
export const AUTHORED_LAND_STRUCTURES: Record<number, { key: string; targetHeightU: number }> = {
  1: { key: 'land-cottage', targetHeightU: 2.9 },
  2: { key: 'land-tower', targetHeightU: 9.3 },
  3: { key: 'land-castle', targetHeightU: 18 },
};

/** Build the structure for a land at `level` (0..3). Returns an empty group at
 *  level 0. The caller positions the group (at scale 1) and tracks the
 *  geos/mats for disposal.
 *
 *  When `registry` has an authored GLB for this level, that is returned instead
 *  — with EMPTY geometry/material arrays, because those resources are shared
 *  with the registry's cached original and must not be disposed by the caller.
 *  The caller's existing teardown loops therefore become safe no-ops. */
export function buildLandStructure(
  THREE: ThreeNS,
  level: number,
  registry?: AuthoredRegistry | null,
): LandStructure {
  const authoredSpec = AUTHORED_LAND_STRUCTURES[level];
  if (authoredSpec && registry) {
    const authored = registry.take(authoredSpec.key);
    if (authored) {
      const wrapper = new THREE.Group();
      wrapper.add(authored);
      return { group: wrapper, geometries: [], materials: [] };
    }
  }
  return buildProceduralLandStructure(THREE, level);
}

function buildProceduralLandStructure(THREE: ThreeNS, level: number): LandStructure {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };
  // Cache materials by (color, roughness) so a castle full of repeated frosting
  // parts is a handful of materials, not one per box.
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: number, roughness = 0.72): THREE.MeshStandardMaterial => {
    const key = `${color}|${roughness}`;
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness });
      materials.push(m);
      matCache.set(key, m);
    }
    return m;
  };

  // ---- Shared small-part geometries (reused across every merlon / cherry /
  // pennant so battlements are a few geometries, not dozens). ----
  const merlonGeo = geo(new THREE.BoxGeometry(0.26, 0.34, 0.22));
  const cherryGeo = geo(new THREE.SphereGeometry(0.16, 12, 10));
  const poleGeo = geo(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6));
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(0.5, -0.14);
  flagShape.lineTo(0, -0.28);
  flagShape.closePath();
  const flagGeo = geo(new THREE.ShapeGeometry(flagShape));

  /** A cherry (the brand signature), reused as a finial. */
  const cherry = (parent: THREE.Group, x: number, y: number, z: number, scale = 1): void => {
    const c = new THREE.Mesh(cherryGeo, mat(CHERRY_RED, 0.3));
    c.position.set(x, y, z);
    c.scale.setScalar(scale);
    c.castShadow = true;
    parent.add(c);
  };

  /** A ring of merlons (battlements) around a tower/keep crown. Shares one
   *  merlon geometry across the whole ring. */
  const crenellate = (
    parent: THREE.Group,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    count: number,
    color: number,
    scale = 1,
  ): void => {
    const m = mat(color, 0.8);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const box = new THREE.Mesh(merlonGeo, m);
      box.position.set(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius);
      box.rotation.y = -a;
      box.scale.setScalar(scale);
      box.castShadow = true;
      parent.add(box);
    }
  };

  /** A conical candy spire + cherry finial. Returns the apex y (cherry top). */
  const spire = (
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    color: number,
    cherryScale = 1,
  ): number => {
    const cone = new THREE.Mesh(geo(new THREE.ConeGeometry(radius, height, 16)), mat(color, 0.5));
    cone.position.set(x, y + height / 2, z);
    cone.castShadow = true;
    parent.add(cone);
    cherry(parent, x, y + height + 0.12 * cherryScale, z, cherryScale);
    return y + height + 0.24 * cherryScale;
  };

  /** A cream flag-pole + colored pennant. Returns the pole-top y. */
  const pennant = (
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    color: number,
    scale = 1,
  ): number => {
    const pole = new THREE.Mesh(poleGeo, mat(FROSTING.cream, 0.6));
    pole.position.set(x, y + (0.7 * scale) / 2, z);
    pole.scale.set(1, scale, 1);
    parent.add(pole);
    // Pennant flags are two-sided (a flat triangle), so their own material.
    const fm = new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide });
    materials.push(fm);
    const flag = new THREE.Mesh(flagGeo, fm);
    flag.position.set(x + 0.02, y + 0.7 * scale - 0.06, z);
    flag.scale.setScalar(scale);
    parent.add(flag);
    return y + 0.7 * scale;
  };

  if (level >= 3) {
    // ---- Castle — a magnificent tiered cake keep. ----
    // Broad tiered cake base (the motte the whole castle stands on).
    let baseY = 0;
    const baseTiers = [
      { r: 2.5, h: 1.6, c: FROSTING.cream },
      { r: 2.05, h: 1.4, c: FROSTING.strawberry },
    ];
    for (const t of baseTiers) {
      const tier = new THREE.Mesh(
        geo(new THREE.CylinderGeometry(t.r, t.r * 1.04, t.h, 30)),
        mat(t.c, 0.75),
      );
      tier.position.y = baseY + t.h / 2;
      tier.castShadow = true;
      tier.receiveShadow = true;
      group.add(tier);
      baseY += t.h;
    }
    // baseY ≈ 3.0 — the motte top, where the wall, towers, and keep stand.

    // Curtain wall ring (an open cylinder) + battlements around the motte rim.
    const wallMat = new THREE.MeshStandardMaterial({
      color: FROSTING.cream,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    materials.push(wallMat);
    const wall = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(2.0, 2.0, 0.8, 30, 1, true)),
      wallMat,
    );
    wall.position.y = baseY + 0.4;
    wall.castShadow = true;
    group.add(wall);
    crenellate(group, 0, baseY + 0.9, 0, 2.0, 18, FROSTING.vanilla, 0.9);

    // Four corner towers on the wall ring — each a two-tier cake stack capped by
    // a candy spire + pennant.
    const cornerR = 1.75;
    const corners = [
      { a: Math.PI * 0.25, c: FROSTING.strawberry, f: FROSTING.mint },
      { a: Math.PI * 0.75, c: FROSTING.mint, f: FROSTING.strawberry },
      { a: Math.PI * 1.25, c: FROSTING.vanilla, f: FROSTING.strawberry },
      { a: Math.PI * 1.75, c: FROSTING.strawberry, f: FROSTING.mint },
    ];
    for (const cn of corners) {
      const cx = Math.cos(cn.a) * cornerR;
      const cz = Math.sin(cn.a) * cornerR;
      let ty = baseY;
      const t1 = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.6, 0.66, 2.4, 16)), mat(cn.c, 0.7));
      t1.position.set(cx, ty + 1.2, cz);
      t1.castShadow = true;
      group.add(t1);
      ty += 2.4;
      const t2 = new THREE.Mesh(
        geo(new THREE.CylinderGeometry(0.52, 0.58, 2.0, 16)),
        mat(FROSTING.cream, 0.7),
      );
      t2.position.set(cx, ty + 1.0, cz);
      t2.castShadow = true;
      group.add(t2);
      ty += 2.0;
      crenellate(group, cx, ty + 0.06, cz, 0.5, 8, FROSTING.vanilla, 0.75);
      const apex = spire(group, cx, ty + 0.2, cz, 0.6, 1.6, cn.c, 0.9);
      pennant(group, cx, apex, cz, cn.f, 0.85);
    }

    // Central keep — four tapering cake tiers, a battlement crown, a tall spire,
    // and a grand pennant. This is the crown; its apex is the castle's height.
    let ky = baseY;
    const keepTiers = [
      { r: 1.4, h: 2.5, c: FROSTING.strawberry },
      { r: 1.25, h: 2.3, c: FROSTING.cream },
      { r: 1.1, h: 2.1, c: FROSTING.mint },
      { r: 0.95, h: 1.9, c: FROSTING.cream },
    ];
    for (const t of keepTiers) {
      const tier = new THREE.Mesh(
        geo(new THREE.CylinderGeometry(t.r, t.r * 1.06, t.h, 24)),
        mat(t.c, 0.72),
      );
      tier.position.y = ky + t.h / 2;
      tier.castShadow = true;
      group.add(tier);
      ky += t.h;
    }
    // ky ≈ 3.0 + 8.8 = 11.8.
    crenellate(group, 0, ky + 0.12, 0, 0.9, 12, FROSTING.vanilla, 0.9);
    ky += 0.4; // ≈ 12.2
    const keepApex = spire(group, 0, ky, 0, 1.05, 4.6, FROSTING.strawberry, 1.4); // ≈ 17.1
    pennant(group, 0, keepApex, 0, FROSTING.mint, 1.3); // apex ≈ 18.0

    // Gatehouse + door on the south face (toward the player / cupcake marker).
    const gate = new THREE.Mesh(geo(new THREE.BoxGeometry(1.5, 1.9, 0.6)), mat(FROSTING.cream, 0.75));
    gate.position.set(0, baseY + 0.95, 2.3);
    gate.castShadow = true;
    group.add(gate);
    for (const gx of [-0.45, 0.45]) {
      const mb = new THREE.Mesh(merlonGeo, mat(FROSTING.vanilla, 0.9));
      mb.position.set(gx, baseY + 1.98, 2.3);
      mb.castShadow = true;
      group.add(mb);
    }
    const door = new THREE.Mesh(geo(new THREE.BoxGeometry(0.8, 1.2, 0.12)), mat(DOOR_BROWN, 0.8));
    door.position.set(0, baseY + 0.6, 2.62);
    group.add(door);
  } else if (level === 2) {
    // ---- Tower — a single tall, slender tapering cake spire. ----
    let y = 0;
    const tiers = [
      { r: 0.78, h: 1.7, c: FROSTING.strawberry },
      { r: 0.7, h: 1.6, c: FROSTING.cream },
      { r: 0.62, h: 1.5, c: FROSTING.mint },
      { r: 0.55, h: 1.3, c: FROSTING.cream },
    ];
    for (const t of tiers) {
      const tier = new THREE.Mesh(
        geo(new THREE.CylinderGeometry(t.r, t.r * 1.06, t.h, 20)),
        mat(t.c, 0.7),
      );
      tier.position.y = y + t.h / 2;
      tier.castShadow = true;
      tier.receiveShadow = true;
      group.add(tier);
      y += t.h;
    }
    // Balcony icing ring midway.
    const balcony = new THREE.Mesh(
      geo(new THREE.TorusGeometry(0.72, 0.1, 8, 20)),
      mat(FROSTING.strawberry, 0.5),
    );
    balcony.rotation.x = Math.PI / 2;
    balcony.position.y = 3.3;
    group.add(balcony);
    // Crenellated crown + candy-cane spire + pennant.
    crenellate(group, 0, y + 0.12, 0, 0.52, 8, FROSTING.vanilla, 0.85);
    y += 0.34;
    const apex = spire(group, 0, y, 0, 0.62, 1.9, FROSTING.strawberry, 1.1);
    pennant(group, 0, apex, 0, FROSTING.mint, 1.0);
    // Door + a high round window.
    const door = new THREE.Mesh(geo(new THREE.BoxGeometry(0.42, 0.72, 0.06)), mat(DOOR_BROWN, 0.8));
    door.position.set(0, 0.36, 0.8);
    group.add(door);
    const win = new THREE.Mesh(geo(new THREE.CircleGeometry(0.16, 16)), mat(FROSTING.vanilla, 0.35));
    win.position.set(0, 3.0, 0.63);
    group.add(win);
  } else if (level === 1) {
    // ---- Cottage — a wide, low, cozy cake body under a broad pitched roof. ----
    const body = new THREE.Mesh(geo(new THREE.BoxGeometry(2.2, 1.4, 1.9)), mat(FROSTING.cream, 0.8));
    body.position.y = 0.7;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // Icing drip band along the eaves.
    const eave = new THREE.Mesh(
      geo(new THREE.TorusGeometry(1.28, 0.12, 8, 22)),
      mat(FROSTING.strawberry, 0.5),
    );
    eave.rotation.x = Math.PI / 2;
    eave.position.y = 1.4;
    eave.scale.set(1, 0.85, 1);
    group.add(eave);
    // Broad frosting-pink pitched roof (4-sided pyramid) + a cherry on the peak.
    const roof = new THREE.Mesh(geo(new THREE.ConeGeometry(1.75, 1.4, 4)), mat(ROOF_PINK, 0.6));
    roof.position.y = 2.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    cherry(group, 0, 2.9, 0, 1.1);
    // Chocolate chimney.
    const chimney = new THREE.Mesh(
      geo(new THREE.BoxGeometry(0.34, 0.8, 0.34)),
      mat(FROSTING.chocolate, 0.85),
    );
    chimney.position.set(0.62, 2.2, 0.32);
    chimney.castShadow = true;
    group.add(chimney);
    // Door + two round candy windows.
    const door = new THREE.Mesh(geo(new THREE.BoxGeometry(0.5, 0.82, 0.06)), mat(DOOR_BROWN, 0.8));
    door.position.set(0, 0.41, 0.96);
    group.add(door);
    const winGeo = geo(new THREE.CircleGeometry(0.19, 16));
    const winMat = mat(FROSTING.vanilla, 0.35);
    for (const wx of [-0.68, 0.68]) {
      const w = new THREE.Mesh(winGeo, winMat);
      w.position.set(wx, 0.9, 0.96);
      group.add(w);
    }
  }
  // level 0 (Plot): empty group — the pedestal + cupcake alone, so the first
  // upgrade (→ Cottage) reads as a real change.

  return { group, geometries, materials };
}
