// Turning a PieceStyle recipe into meshes.
//
// A small interpreter over the Part vocabulary in styles.ts, so the art lives in
// a content module and the geometry code stays generic. Adding a set should mean
// editing data, never editing this file.
//
// GEOMETRY AND MATERIALS ARE BUILT ONCE PER SIDE AND SHARED BY ALL 24 PIECES —
// the same discipline that lets town/three/chessboard.ts cover 32 chess pieces
// with six lathe profiles. A style costs at most 4 geometries and 2 materials
// however many pieces are on the board.
//
// PIECES HINGE AT THEIR BASE. Every piece is a Group whose origin sits on the
// playing plane with the mesh built upward from y=0. The hop animation rotates
// the group, and it only reads right if the pivot is where the piece touches the
// board.
//
// No runtime `three` import.

import type * as THREE from 'three';
import { cakeMat, candyMat, cookieMat, frostingMat, glowSprite } from '@/lib/town/three/materials';
import { CAKE } from '@/lib/games/theme/palette';
import { styleHeight, type MatKind, type Part, type PieceStyle, type Slot } from './styles';
import type { ThreeNS } from './types';
import type { Side } from './rules';

/** Crown geometry is built ONCE and shared by every style and both sides — two
 *  geometries total, not two per set. A crowned piece is a crowned piece. */
const CROWN_BAND_R = 0.16;
const CROWN_H = 0.055;
const CROWN_POINTS = 5;

export interface PieceSet {
  /** A fresh piece Group for a side. Crowns are added later by crown(). */
  make(side: Side): THREE.Group;
  /** Add the coronet and its halo to a piece that has just been kinged. */
  crown(piece: THREE.Group, side: Side): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

function matFor(THREE: ThreeNS, kind: MatKind, color: number): THREE.MeshStandardMaterial {
  switch (kind) {
    case 'frosting':
      return frostingMat(THREE, color);
    case 'cake':
      return cakeMat(THREE, color);
    case 'candy':
      return candyMat(THREE, color);
    default:
      return cookieMat(THREE, color);
  }
}

export function buildPieceSet(THREE: ThreeNS, style: PieceStyle): PieceSet {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  // Widened vs. the town's track(): the bins are Material[]/BufferGeometry[] but
  // callers hand in concrete subtypes and need the concrete type BACK, or every
  // material read below loses its properties.
  const track = <B, T extends B>(bin: B[], item: T): T => {
    bin.push(item);
    return item;
  };

  // One material pair per side, shared by every piece of that side.
  const mats: Record<Side, Record<Slot, THREE.MeshStandardMaterial>> = {
    light: {
      body: track(materials, matFor(THREE, style.bodyMat, style.light.body)),
      accent: track(materials, matFor(THREE, style.accentMat, style.light.accent)),
    },
    dark: {
      body: track(materials, matFor(THREE, style.bodyMat, style.dark.body)),
      accent: track(materials, matFor(THREE, style.accentMat, style.dark.accent)),
    },
  };

  // Fleck palettes (sprinkles) need their own materials — one per colour, still
  // shared across every piece that uses them.
  const fleckMats = new Map<number, THREE.MeshStandardMaterial>();
  const fleckMat = (color: number): THREE.MeshStandardMaterial => {
    let m = fleckMats.get(color);
    if (!m) {
      m = track(materials, candyMat(THREE, color));
      fleckMats.set(color, m);
    }
    return m;
  };

  // One geometry per part, shared across sides — the shape does not depend on
  // which colour is wearing it.
  const geos = style.parts.map((p): THREE.BufferGeometry => {
    switch (p.kind) {
      case 'lathe':
        return track(
          geometries,
          new THREE.LatheGeometry(
            p.profile.map(([r, h]) => new THREE.Vector2(r, h)),
            p.segments,
          ),
        );
      case 'cylinder':
        return track(geometries, new THREE.CylinderGeometry(p.rTop, p.rBottom, p.h, p.segments));
      case 'torus':
        return track(geometries, new THREE.TorusGeometry(p.r, p.tube, p.radial, p.tubular));
      default:
        return track(geometries, new THREE.SphereGeometry(p.r, 8, 6));
    }
  });

  const addPart = (group: THREE.Group, part: Part, geo: THREE.BufferGeometry, side: Side, seed: number): void => {
    if (part.kind === 'flecks') {
      for (let i = 0; i < part.count; i += 1) {
        // Rotated by a per-piece seed so 24 cookies are not 24 copies of one
        // cookie — the cheapest possible variety, no extra geometry.
        const a = ((i + seed * 0.37) / part.count) * Math.PI * 2;
        const color = part.palette ? part.palette[i % part.palette.length] : undefined;
        const m = new THREE.Mesh(geo, color !== undefined ? fleckMat(color) : mats[side][part.mat]);
        m.position.set(Math.cos(a) * part.ring, part.y, Math.sin(a) * part.ring);
        m.scale.y = 0.55; // squashed into the surface, not a ball sitting on it
        group.add(m);
      }
      return;
    }

    const mesh = new THREE.Mesh(geo, mats[side][part.mat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (part.kind === 'torus') {
      // A TorusGeometry stands upright by default; lay it flat so it reads as a
      // rim or a band rather than a hoop.
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = part.y;
    } else if (part.kind === 'cylinder') {
      mesh.position.y = part.y;
    }
    group.add(mesh);
  };

  // --- the crown -----------------------------------------------------------
  //
  // A coronet, NOT a second stacked disc. Stacking doubles a piece's height,
  // which occludes the rank behind it — the exact failure the high camera pitch
  // was chosen to avoid — and to a six-year-old it reads as two pieces or as a
  // bug. A crown adds 0.09 and is unmistakable at any size.
  const bandGeo = track(geometries, new THREE.CylinderGeometry(CROWN_BAND_R, CROWN_BAND_R * 0.82, CROWN_H, CROWN_POINTS));
  const pointGeo = track(geometries, new THREE.ConeGeometry(0.035, 0.07, 4));
  const crownMat = track(materials, candyMat(THREE, CAKE.AMBER));

  return {
    geometries,
    materials,
    textures,

    make(side) {
      const group = new THREE.Group();
      const seed = Math.random();
      style.parts.forEach((part, i) => addPart(group, part, geos[i], side, seed));
      group.userData.side = side;
      group.userData.king = false;
      // Where a crown would sit. Derived from the recipe, not typed per style —
      // a set that changes height must not leave its crown floating.
      group.userData.topY = styleHeight(style);
      return group;
    },

    crown(piece, side) {
      if (piece.userData.king) return;
      piece.userData.king = true;

      const top = piece.userData.topY as number;
      const crown = new THREE.Group();
      crown.name = 'crown';

      const band = new THREE.Mesh(bandGeo, crownMat);
      band.position.y = CROWN_H / 2;
      band.castShadow = true;
      crown.add(band);

      for (let i = 0; i < CROWN_POINTS; i += 1) {
        const a = (i / CROWN_POINTS) * Math.PI * 2;
        const p = new THREE.Mesh(pointGeo, crownMat);
        p.position.set(Math.cos(a) * CROWN_BAND_R * 0.86, CROWN_H + 0.03, Math.sin(a) * CROWN_BAND_R * 0.86);
        crown.add(p);
      }

      // The second channel. Shape alone would make king-ness a silhouette read
      // at 12px; the halo means it also survives a glance, a small screen and a
      // colour-blind kid. Glow is rationed to kings and the selection ring, so
      // "the one that glows is the king" is learnable in a single game.
      const halo = glowSprite(THREE, CAKE.AMBER, 0.55, 0.35);
      halo.sprite.position.y = CROWN_H + 0.1;
      crown.add(halo.sprite);
      textures.push(halo.tex);
      materials.push(halo.mat);

      crown.position.y = top;
      // Scale is animated from 0 by the engine's crowning beat; under reduced
      // motion the engine sets it to 1 immediately.
      crown.scale.setScalar(0.001);
      piece.add(crown);
      void side;
    },
  };
}
