// Confectionery critters — composed sprites that stand in for the
// animal characters across the catalog. Each function returns a
// Phaser Container the caller positions via setPosition / tweens,
// same surface area as a sprite or text object.
//
// Why these exist: the Gamecakes brand is sweets. Animal-themed game
// critters (sharks, minnows, bird) were placeholders from earlier
// iterations and don't fit the cake/cookie/candy world the rest of
// the catalog inhabits. These three draw helpers swap the legacy
// animals for sweet equivalents:
//
//   drawSharkCookie  → Minnow Catch chomp animation
//   drawSwedishFish  → Minnow Catch minnows
//   drawCakeyPlane   → Flappy Math bird (Cakey as the pilot)
//
// Each is a Container holding shape Graphics + (sometimes) accent
// Text. Tween the Container as a whole; .destroy() cascades to the
// children automatically.

import * as Phaser from 'phaser';
import { drawCupcake } from './cupcake';
import type { CupcakeConfig } from '@/lib/cupcake/config';

// ---------------------------------------------------------------------------
// Shark cookie — chocolate-brown shark silhouette with cookie speckles,
// white triangular teeth, and an eye. Used by the fishing scene's
// chomp animation when a fish is caught.
// ---------------------------------------------------------------------------

export interface SharkCookieOpts {
  /** Render scale. 1 = the baseline ~50px-wide silhouette. */
  scale?: number;
}

export function drawSharkCookie(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts?: SharkCookieOpts,
): Phaser.GameObjects.Container {
  const scale = opts?.scale ?? 1;
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();

  // Body — chocolate cookie brown. Drawn as a closed path so the
  // dorsal fin + tail fork live inside the same fill (no seams).
  g.fillStyle(0x78350f, 1);
  g.lineStyle(1.4, 0x451a03, 1);
  g.beginPath();
  // Start at the nose, walk clockwise over the top.
  g.moveTo(-24, 0);
  g.lineTo(-12, -8);
  g.lineTo(-2, -9);
  g.lineTo(4, -14);  // dorsal fin peak
  g.lineTo(10, -8);
  g.lineTo(18, -8);
  g.lineTo(22, -12); // top of tail fork
  g.lineTo(26, -2);
  g.lineTo(22, 4);
  g.lineTo(26, 12);  // bottom of tail fork
  g.lineTo(20, 6);
  g.lineTo(12, 8);
  g.lineTo(2, 8);
  g.lineTo(-10, 6);
  g.lineTo(-20, 4);
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Cookie speckles — six darker dots scattered across the body.
  g.fillStyle(0x451a03, 1);
  for (const [px, py] of [
    [-14, -3], [-6, -4], [4, -5], [12, -3],
    [-8, 3], [4, 3], [14, 2],
  ] as const) {
    g.fillCircle(px, py, 1.2);
  }

  // Teeth — three small white triangles along the front jawline so
  // the chomp reads as "I am about to bite" at a glance.
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(-22, 1, -19, 3, -22, 4);
  g.fillTriangle(-18, 1, -15, 3, -18, 4);
  g.fillTriangle(-14, 1, -11, 3, -14, 4);

  // Eye — white circle + dark pupil. Positioned high on the forehead
  // so the silhouette reads "predator looking forward."
  g.fillStyle(0xffffff, 1).fillCircle(-12, -4, 2.5);
  g.fillStyle(0x111827, 1).fillCircle(-11.5, -4, 1.3);

  container.add(g);
  container.setScale(scale);
  return container;
}

// ---------------------------------------------------------------------------
// Swedish fish — red candy fish silhouette with sugar-crystal dots,
// a smile, and an eye. Used by the fishing scene's hopping
// minnows.
// ---------------------------------------------------------------------------

export interface SwedishFishOpts {
  /** Render scale. 1 = the baseline ~28px-wide silhouette. */
  scale?: number;
}

export function drawSwedishFish(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts?: SwedishFishOpts,
): Phaser.GameObjects.Container {
  const scale = opts?.scale ?? 1;
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();

  // Candy body — classic Swedish fish red. Drawn pointing right with
  // a forked tail; the body is one closed path so it reads gummy.
  g.fillStyle(0xdc2626, 1);
  g.lineStyle(1, 0x7f1d1d, 1);
  g.beginPath();
  g.moveTo(-13, 0);    // nose
  g.lineTo(-8, -7);    // top of head
  g.lineTo(2, -7);     // top of body
  g.lineTo(7, -5);     // pre-tail top
  g.lineTo(13, -9);    // top tail fork
  g.lineTo(13, -2);    // tail inner top
  g.lineTo(10, 0);     // tail center
  g.lineTo(13, 2);     // tail inner bottom
  g.lineTo(13, 9);     // bottom tail fork
  g.lineTo(7, 5);      // pre-tail bottom
  g.lineTo(2, 7);      // bottom of body
  g.lineTo(-8, 7);     // bottom of head
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Sugar-crystal lighter dots — that grainy translucent-candy look
  // you get when light hits the dyed sugar surface.
  g.fillStyle(0xfca5a5, 0.85);
  for (const [px, py] of [
    [-4, -3], [-1, 1], [2, -2], [4, 2], [-2, 4], [-5, -1], [-6, 3],
  ] as const) {
    g.fillCircle(px, py, 0.7);
  }

  // Eye — small white + dark pupil. Smaller than the shark's because
  // the fish is friendlier.
  g.fillStyle(0xffffff, 1).fillCircle(-7, -3, 1.6);
  g.fillStyle(0x111827, 1).fillCircle(-6.8, -3, 0.8);

  // Mouth — tiny smile curve under the eye.
  g.lineStyle(0.8, 0x7f1d1d, 1);
  g.beginPath();
  g.moveTo(-11, 1);
  g.lineTo(-7, 4);
  g.strokePath();

  container.add(g);
  container.setScale(scale);
  return container;
}

// ---------------------------------------------------------------------------
// Cakey-in-a-plane — small biplane silhouette with the 🎂 mascot
// peeking out of the cockpit. Replaces the Flappy Math bird; the
// plane carries the gameplay metaphor (forward motion, tap-to-flap-
// or-climb) while Cakey stays brand-central.
// ---------------------------------------------------------------------------

export interface CakeyPlaneOpts {
  /** Render scale. 1 = the baseline ~44px-wide plane. */
  scale?: number;
  /** If set, the kid's customized cupcake rides in the cockpit instead
   *  of the default 🎂 mascot glyph — so the kid flies as their own
   *  Cakey Store character. Omit for the generic Cakey pilot. */
  cupcakeConfig?: CupcakeConfig;
}

export function drawCakeyPlane(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts?: CakeyPlaneOpts,
): Phaser.GameObjects.Container {
  const scale = opts?.scale ?? 1;
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();

  // Tail fin first (behind everything) — strawberry vertical fin at
  // the back. Drawn before the body so the body overlaps it cleanly.
  g.fillStyle(0xfb7185, 1);
  g.lineStyle(1, 0xbe185d, 1);
  g.beginPath();
  g.moveTo(-18, 0);
  g.lineTo(-25, -11);
  g.lineTo(-20, -8);
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Fuselage — strawberry oval body.
  g.fillStyle(0xfb7185, 1);
  g.lineStyle(1.4, 0xbe185d, 1);
  g.fillEllipse(0, 0, 38, 18);
  g.strokeEllipse(0, 0, 38, 18);

  // Wing — vanilla biplane-style strip across the bottom of the
  // fuselage. The wing reads as "the plane is here, not just an
  // oval with a face."
  g.fillStyle(0xfde68a, 1);
  g.lineStyle(0.9, 0xca8a04, 1);
  g.fillRect(-20, 4, 40, 5);
  g.strokeRect(-20, 4, 40, 5);

  // Cockpit window — sky-blue circle behind where the emoji sits, so
  // Cakey reads as "inside a windscreen" rather than glued to the
  // fuselage.
  g.fillStyle(0xbae6fd, 0.9);
  g.lineStyle(1.2, 0x0284c7, 1);
  g.fillCircle(2, -5, 9);
  g.strokeCircle(2, -5, 9);

  // Propeller — small hub at the nose + crossed motion-blur lines so
  // the plane reads as moving without an animation.
  g.fillStyle(0x4b5563, 1).fillCircle(20, 0, 2.6);
  g.lineStyle(2, 0x9ca3af, 0.55);
  g.beginPath();
  g.moveTo(20, -10);
  g.lineTo(20, 10);
  g.strokePath();
  g.beginPath();
  g.moveTo(15, 0);
  g.lineTo(25, 0);
  g.strokePath();

  container.add(g);

  // Cockpit occupant. If the kid brought their Cakey Store cupcake, they
  // fly as themselves — the drawn cupcake sits in the windscreen (scaled
  // to fit the r=9 window at (2,-5)). Otherwise fall back to the generic
  // Cakey 🎂 glyph, the same mascot shown in /town, /map, and Cakey Chase.
  if (opts?.cupcakeConfig) {
    const cake = drawCupcake(scene, 2, -4, {
      config: opts.cupcakeConfig,
      scale: 0.34,
    });
    container.add(cake);
  } else {
    const cakey = scene.add
      .text(2, -5, '🎂', {
        fontSize: '16px',
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      })
      .setOrigin(0.5);
    container.add(cakey);
  }

  container.setScale(scale);
  return container;
}

// ---------------------------------------------------------------------------
// BA-bear-in-a-plane — same plane silhouette/dimensions as drawCakeyPlane
// (so FlappyScene's physics body + rotation tuning carry over untouched),
// re-themed in the BA school colors with a vector mini-mascot in the
// cockpit: navy bear, white muzzle, gold shirt collar. Used by the /ba
// arcade's Flappy Math instead of Cakey.
// ---------------------------------------------------------------------------

// Sampled from the BA mascot artwork: navy fur + gold shirt.
const BA_NAVY = 0x21306b;
const BA_NAVY_DARK = 0x141d44;
const BA_GOLD = 0xf8c732;
const BA_GOLD_DARK = 0xb98a0a;

export function drawBaBearPlane(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts?: CakeyPlaneOpts,
): Phaser.GameObjects.Container {
  const scale = opts?.scale ?? 1;
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();

  // Tail fin — gold, behind the body.
  g.fillStyle(BA_GOLD, 1);
  g.lineStyle(1, BA_GOLD_DARK, 1);
  g.beginPath();
  g.moveTo(-18, 0);
  g.lineTo(-25, -11);
  g.lineTo(-20, -8);
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Fuselage — navy oval.
  g.fillStyle(BA_NAVY, 1);
  g.lineStyle(1.4, BA_NAVY_DARK, 1);
  g.fillEllipse(0, 0, 38, 18);
  g.strokeEllipse(0, 0, 38, 18);

  // Wing — gold strip, same biplane read as the Cakey plane.
  g.fillStyle(BA_GOLD, 1);
  g.lineStyle(0.9, BA_GOLD_DARK, 1);
  g.fillRect(-20, 4, 40, 5);
  g.strokeRect(-20, 4, 40, 5);

  // Cockpit window.
  g.fillStyle(0xbae6fd, 0.9);
  g.lineStyle(1.2, 0x0284c7, 1);
  g.fillCircle(2, -5, 9);
  g.strokeCircle(2, -5, 9);

  // ---- Mini BA bear peeking out of the cockpit ----
  // Gold shirt collar filling the lower cockpit, under the chin.
  g.fillStyle(BA_GOLD, 1);
  g.fillEllipse(2, 1, 13, 7);

  // Ears first (behind the head), navy with a lighter inner dot.
  g.fillStyle(BA_NAVY, 1);
  g.lineStyle(1, BA_NAVY_DARK, 1);
  g.fillCircle(-3, -12.5, 2.8);
  g.strokeCircle(-3, -12.5, 2.8);
  g.fillCircle(7, -12.5, 2.8);
  g.strokeCircle(7, -12.5, 2.8);
  g.fillStyle(0xf8fafc, 0.85);
  g.fillCircle(-3, -12.5, 1.2);
  g.fillCircle(7, -12.5, 1.2);

  // Head — navy circle.
  g.fillStyle(BA_NAVY, 1);
  g.lineStyle(1, BA_NAVY_DARK, 1);
  g.fillCircle(2, -7, 7);
  g.strokeCircle(2, -7, 7);

  // Muzzle — white lower half of the face.
  g.fillStyle(0xf8fafc, 1);
  g.fillEllipse(2, -4, 8.5, 6);

  // Eyes — white with navy pupils, the mascot's wide-eyed look.
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-0.6, -8.2, 1.9);
  g.fillCircle(4.6, -8.2, 1.9);
  g.fillStyle(BA_NAVY_DARK, 1);
  g.fillCircle(-0.2, -8, 0.9);
  g.fillCircle(4.2, -8, 0.9);

  // Nose — navy oval on the muzzle.
  g.fillStyle(BA_NAVY_DARK, 1);
  g.fillEllipse(2, -5, 2.6, 1.8);

  // Propeller — same hub + motion-blur cross as the Cakey plane.
  g.fillStyle(0x4b5563, 1).fillCircle(20, 0, 2.6);
  g.lineStyle(2, 0x9ca3af, 0.55);
  g.beginPath();
  g.moveTo(20, -10);
  g.lineTo(20, 10);
  g.strokePath();
  g.beginPath();
  g.moveTo(15, 0);
  g.lineTo(25, 0);
  g.strokePath();

  container.add(g);

  // "BA" branding on the rear fuselage — gold on navy, like the shirt.
  const badge = scene.add
    .text(-9, 0, 'BA', {
      fontSize: '7px',
      fontStyle: 'bold',
      color: '#f8c732',
      fontFamily: 'Arial, sans-serif',
    })
    .setOrigin(0.5);
  container.add(badge);

  container.setScale(scale);
  return container;
}
