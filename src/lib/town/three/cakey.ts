// Cakey — the Gamecakes mascot as a walking 3D NPC in the town.
//
// This is the 3D counterpart to the 2D SVG mascot in
// src/components/GamecakesMascot.tsx: an anthropomorphized 3-layer cake
// (strawberry / vanilla / mint, cherry-hat on top, stubby cherry-red shoes),
// built from primitives so it carries no asset pipeline — matching how the kid
// avatar (buildCupcakeModel) and the town decor are made.
//
// Split of concerns (mirrors avatar.ts): this module owns Cakey's LOOK and his
// per-frame VISUAL update (walk-bob + turn-to-face). The engine owns his
// wander MATH (target picking, collision, terrain height) and feeds this
// update the resulting velocity each frame. Content (what he says) lives in
// React + cakey-lines.ts, never here.
//
// No runtime `three` import — the namespace arrives as an argument (ThreeNS),
// so this module never enters the server bundle. Callers own disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { cakeMat, candyMat, frostingMat } from './materials';

/** The mascot's four expressions — same vocabulary as the 2D GamecakesMascot. */
export type CakeyMood = 'idle' | 'happy' | 'wave' | 'celebrate';

// Brand palette, lifted verbatim from GamecakesMascot.tsx so the 3D Cakey reads
// as the same character as the logo/greeter.
const C = {
  strawberry: 0xfb7185,
  strawberryRim: 0xfda4af,
  vanilla: 0xfde68a,
  vanillaRim: 0xfef3c7,
  mint: 0x6ee7b7,
  mintRim: 0xa7f3d0,
  cherry: 0xdc2626,
  stem: 0x166534,
  shoe: 0xdc2626,
  sock: 0xffffff,
  ink: '#1f2937',
  eyeWhite: '#ffffff',
  cheek: '#fca5a5',
  mouth: '#1f2937',
} as const;

export interface Cakey {
  group: THREE.Group;
  /** Invisible box the engine raycasts to detect a tap on Cakey. */
  hitMesh: THREE.Mesh;
  /** Per-frame visual update. `isMoving` drives the walk-bob; a non-zero
   *  (velX, velZ) turns him to face that heading even when standing still, so
   *  the engine can point him at the kid while they talk. Scene-unit velocity. */
  update(dtMs: number, isMoving: boolean, velX: number, velZ: number): void;
  /** Swap the face-plane expression. No-op if already in that mood. */
  setMood(mood: CakeyMood): void;
  dispose(): void;
}

/** Draw one mood's face onto a 128² canvas — eyes, pupils, highlights, cheeks,
 *  and a per-mood mouth — echoing GamecakesMascot's <Face>. Transparent bg so
 *  it sits as a textured sticker on the vanilla tier's front plane. */
function drawFace(mood: CakeyMood): HTMLCanvasElement {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);

  // The whole face is composed around the canvas centre (y≈64) so it reads
  // balanced on the flat plane at 2× scale — features used to sit low and
  // drift off the vanilla tier.

  // Cheek blushes.
  ctx.fillStyle = C.cheek;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.ellipse(30, 72, 10, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(98, 72, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Eyes — white with a dark outline, big round pupils, twin highlights.
  const pupilDY = mood === 'celebrate' ? -2 : 0;
  for (const ex of [44, 84]) {
    ctx.beginPath();
    ctx.arc(ex, 52, 16, 0, Math.PI * 2);
    ctx.fillStyle = C.eyeWhite;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, 54 + pupilDY, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - 3, 50 + pupilDY, 3.2, 0, Math.PI * 2);
    ctx.arc(ex + 3, 58 + pupilDY, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Mouth — different per mood.
  ctx.strokeStyle = C.mouth;
  ctx.fillStyle = C.mouth;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  if (mood === 'idle') {
    ctx.beginPath();
    ctx.moveTo(52, 82);
    ctx.quadraticCurveTo(64, 90, 76, 82);
    ctx.stroke();
  } else if (mood === 'happy' || mood === 'wave') {
    ctx.beginPath();
    ctx.moveTo(50, 80);
    ctx.quadraticCurveTo(64, 96, 78, 80);
    ctx.quadraticCurveTo(64, 90, 50, 80);
    ctx.fill();
  } else {
    // celebrate — wide open shout with a red tongue.
    ctx.beginPath();
    ctx.ellipse(64, 86, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dc2626'; // cherry-red tongue (canvas needs a string)
    ctx.beginPath();
    ctx.ellipse(64, 89, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

export function createCakey(
  THREE: ThreeNS,
  opts: { reduceMotion?: boolean } = {},
): Cakey {
  const reduceMotion = opts.reduceMotion ?? false;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  // Bob rides an inner group so the heading rotation (on `group`) and the
  // vertical bounce never fight (same trick as the kid avatar).
  const body = new THREE.Group();
  group.add(body);

  const addBox = (
    w: number,
    h: number,
    d: number,
    y: number,
    mat: THREE.Material,
    z = 0,
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, y, z);
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  };

  // ---- Shoes + legs (stubby, cherry-red shoes like the 2D mascot) ----
  const shoeMat = candyMat(THREE, C.shoe);
  const legMat = cakeMat(THREE, C.vanilla);
  mats.push(shoeMat, legMat);
  const shoeGeo = new THREE.SphereGeometry(0.12, 12, 10);
  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10);
  geos.push(shoeGeo, legGeo);
  for (const lx of [-0.16, 0.16]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.scale.set(1, 0.55, 1.5); // squashed toe, pointing forward (+z)
    shoe.position.set(lx, 0.06, 0.12);
    shoe.castShadow = true;
    body.add(shoe);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.17, 0.06);
    body.add(leg);
  }

  // ---- Three stacked cake tiers (widest at the bottom) ----
  const strawberryMat = cakeMat(THREE, C.strawberry);
  const vanillaMat = cakeMat(THREE, C.vanilla);
  const mintMat = cakeMat(THREE, C.mint);
  const strawberryRimMat = frostingMat(THREE, C.strawberryRim);
  const vanillaRimMat = frostingMat(THREE, C.vanillaRim);
  const mintRimMat = frostingMat(THREE, C.mintRim);
  mats.push(strawberryMat, vanillaMat, mintMat, strawberryRimMat, vanillaRimMat, mintRimMat);

  // Bottom (strawberry): 0.28 → 0.56
  addBox(0.92, 0.28, 0.64, 0.42, strawberryMat);
  addBox(0.94, 0.05, 0.66, 0.565, strawberryRimMat); // rim band on top
  // Middle (vanilla, hosts the face): 0.58 → 0.82
  addBox(0.74, 0.24, 0.54, 0.70, vanillaMat);
  addBox(0.76, 0.045, 0.56, 0.815, vanillaRimMat);
  // Top (mint): 0.84 → 1.06
  addBox(0.56, 0.22, 0.44, 0.95, mintMat);
  addBox(0.58, 0.045, 0.46, 1.06, mintRimMat);

  // ---- Arms — little strawberry nubs from the bottom tier ----
  const armMat = candyMat(THREE, C.strawberry);
  const handMat = candyMat(THREE, C.strawberryRim);
  mats.push(armMat, handMat);
  const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
  const handGeo = new THREE.SphereGeometry(0.06, 10, 8);
  geos.push(armGeo, handGeo);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(side * 0.5, 0.42, 0.04);
    arm.rotation.z = side * 0.5;
    body.add(arm);
    const hand = new THREE.Mesh(handGeo, handMat);
    hand.position.set(side * 0.58, 0.33, 0.04);
    body.add(hand);
  }

  // ---- Cherry hat + stem on top ----
  const cherryMat = candyMat(THREE, C.cherry);
  const stemMat = cakeMat(THREE, C.stem);
  mats.push(cherryMat, stemMat);
  const cherryGeo = new THREE.SphereGeometry(0.12, 14, 12);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6);
  geos.push(cherryGeo, stemGeo);
  const cherry = new THREE.Mesh(cherryGeo, cherryMat);
  cherry.position.set(0, 1.2, 0);
  cherry.castShadow = true;
  body.add(cherry);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.set(0.05, 1.32, 0);
  stem.rotation.z = -0.35;
  body.add(stem);

  // ---- Face on the vanilla tier front (+z) ----
  // A flat textured PLANE parented to `body`, NOT a Sprite: a sprite billboards
  // to the camera and so ignores Cakey's heading rotation, leaving his face
  // pinned to the camera (floating off the wrong side) whenever he turns. A
  // plane rotates with him — visible head-on, naturally hidden (back-face
  // culled) when he walks away. alphaTest kills the transparent-fringe sorting
  // that depthWrite:false used to paper over.
  const faceCanvases: Record<CakeyMood, HTMLCanvasElement> = {
    idle: drawFace('idle'),
    happy: drawFace('happy'),
    wave: drawFace('wave'),
    celebrate: drawFace('celebrate'),
  };
  const faceTexs: Record<CakeyMood, THREE.CanvasTexture> = {
    idle: new THREE.CanvasTexture(faceCanvases.idle),
    happy: new THREE.CanvasTexture(faceCanvases.happy),
    wave: new THREE.CanvasTexture(faceCanvases.wave),
    celebrate: new THREE.CanvasTexture(faceCanvases.celebrate),
  };
  for (const m of ['idle', 'happy', 'wave', 'celebrate'] as CakeyMood[]) {
    faceTexs[m].colorSpace = THREE.SRGBColorSpace;
    texs.push(faceTexs[m]);
  }
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTexs.idle,
    transparent: true,
    alphaTest: 0.5,
    side: THREE.FrontSide,
    toneMapped: false, // keep the face bright + crisp, unaffected by scene tone
  });
  mats.push(faceMat);
  const faceGeo = new THREE.PlaneGeometry(0.62, 0.62);
  geos.push(faceGeo);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, 0.72, 0.28); // just proud of the vanilla tier front
  body.add(face);

  // ---- Soft contact shadow disc (cheap, always present) ----
  const discGeo = new THREE.CircleGeometry(0.42, 20);
  const discMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 });
  geos.push(discGeo);
  mats.push(discMat);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  group.add(disc);

  // ---- Invisible tap hit box (raycaster skips visible:false, so it's a
  //      zero-opacity material instead — see engine's raycastCakey). ----
  const hitGeo = new THREE.BoxGeometry(0.9, 1.3, 0.7);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  geos.push(hitGeo);
  mats.push(hitMat);
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.y = 0.65;
  hitMesh.userData.cakeyHit = true;
  group.add(hitMesh);

  // Cakey reads too small next to the kid's cupcake and the booths, so display
  // him at ~1.9× from the group origin. His feet sit at model y≈0, so scaling
  // about the origin keeps him planted on the terrain. Everything parented to
  // `group` scales together — the tap hit box (easier to tap), the contact-
  // shadow disc, and the walk-bob amplitude — so nothing needs re-tuning here.
  // The follow-bubble anchor is bumped separately via CAKEY_HEAD_U in the engine.
  group.scale.setScalar(1.9);

  let bobPhase = 0;
  let heading = 0;
  let mood: CakeyMood = 'idle';

  return {
    group,
    hitMesh,
    update(dtMs: number, isMoving: boolean, velX: number, velZ: number): void {
      // Gentle amble-bob while moving (slower + smaller than the kid avatar);
      // disabled entirely for reduced-motion.
      if (isMoving && !reduceMotion) {
        bobPhase += dtMs / 150;
        body.position.y = Math.abs(Math.sin(bobPhase)) * 0.07;
      } else {
        body.position.y *= 0.85;
      }
      // Turn to face the heading whenever we have a direction — even standing
      // still — so the engine can point Cakey at the kid mid-conversation.
      const sp = Math.hypot(velX, velZ);
      if (sp > 1e-3) {
        const targetH = Math.atan2(velX, velZ);
        let delta = targetH - heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        heading += delta * Math.min(1, dtMs / 160);
        group.rotation.y = heading;
      }
    },
    setMood(next: CakeyMood): void {
      if (next === mood) return;
      mood = next;
      faceMat.map = faceTexs[next];
      faceMat.needsUpdate = true;
    },
    dispose(): void {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
