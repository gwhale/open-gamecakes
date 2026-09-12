// The submarine dock in Caramel Cove — where the town ends and the ocean starts.
//
// Caramel Cove was already the right place before anything was built: it is a
// "hidden inlet of slow, sticky golden waves", it holds no games competing for
// the space, and its landmark glyph in regions.ts has been an anchor (⚓) this
// whole time with nothing to justify it. Its only neighbour is Sprinkle Shore,
// and the water under Sprinkle Shore is Sprinkle Reef. So the harbour did not
// need inventing, and the dive is gated by the cove's existing DEEP unlock cost
// rather than by a new system: no cove, no submarine, no code.
//
// The JETTY is makePier() — the same boardwalk Sprinkle Shore's game booths
// stand on. Only the moored submarine is new. A second plank-laying routine
// would have been a second thing to keep in sync with the water level.
//
// Town conventions hold: gameplay maths in city PIXELS, scene units only at
// mesh placement, no runtime `three` import, caller owns disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { pxToSceneX, pxToSceneZ } from './types';
import { makePier } from './pier';
import { cakeMat, cookieMat, frostingMat, candyMat, candyGlassMat, glowSprite } from './materials';
import { makeBoothSign } from './city3d';
import { CAKE, RIBBON, WOOD } from '@/lib/games/theme/palette';

/** Slug of the land the dock stands on. The dock exists only once this region
 *  is discovered — see the engine's gate. */
export const SUB_DOCK_REGION = 'caramel-cove';

/** How close the cupcake must get before the "Dive" prompt appears (city px).
 *
 *  ITS OWN NUMBER, deliberately. It used to be pinned to FERRY_BOARD_R_PX on
 *  the theory that both ways of leaving the island should feel the same, and
 *  they should not: the ferry is boarded from a wide open dock you walk onto
 *  from anywhere, while the submarine sits at the far end of a long narrow
 *  jetty in a bay. By the time a kid has walked all the way out there they have
 *  made their intention completely clear, and a tight radius means the prompt
 *  only appears once they are standing on the last two planks. */
export const SUB_BOARD_R_PX = 300;

/** How far the jetty runs out (px), and how wide. Narrower than Sprinkle
 *  Shore's pier — this one carries one submarine, not a row of game booths,
 *  and a narrow walkway reads as a jetty rather than as a plaza.
 *
 *  LENGTH IS NOT THE REASON THIS PIER DOES NOT REACH THE SEA. Measured against
 *  the island field: the deck is laid due EAST from the cove's rect edge, but
 *  the coast here faces about 41 degrees, so marching east runs very nearly
 *  TANGENT to the shoreline — beanNd climbs from 0.81 to only 0.85 over 700px
 *  and does not cross 1.0 (the waterline) within 1700px. Making this number
 *  bigger builds a longer pier across the same sand.
 *
 *  Fixing it properly means laying the deck along the cove's outward normal,
 *  where the water is 765px out — which means giving makePier a heading and an
 *  oriented deck rect, since both it and its collision rect are +x only, and
 *  makePier is shared with Sprinkle Shore. That is a real change and it needs
 *  to be looked at in a browser, not reasoned about. */
/** Where the jetty's root sits, as a fraction of the shoreline radius at the
 *  bay's bearing. Just inland of the waterline, so the deck starts on dry sand
 *  a kid can step onto rather than in the surf. */
export const SUB_DOCK_ROOT_FRAC = 0.93;

/** How far the jetty runs out along the bay's axis (px), and how wide.
 *
 *  SET BY MEASUREMENT, NOT TASTE. The root sits at 0.93 of the shoreline
 *  radius, so the waterline is a little over 7% of that radius further out;
 *  the deck has to clear it and then keep going far enough that the submarine,
 *  moored at 86% of the deck, floats in open water rather than in the surf.
 *  sub-dock.test.ts asserts every one of those, against the same island field
 *  the renderer draws from.
 *
 *  Narrower than Sprinkle Shore's pier: this one carries a submarine, not a
 *  row of game booths, and a narrow walkway reads as a jetty. */
const JETTY_LENGTH_PX = 620;
const JETTY_HALF_W_PX = 54;

export interface SubDock {
  group: THREE.Group;
  /** Oriented walkable test for the deck (city-px). The engine registers this
   *  so the kid can walk out over water -- until now makeSubDock threw its deck
   *  away, which is why the jetty only ever worked while it stood on sand. */
  containsPx: (px: number, py: number) => boolean;
  textures: THREE.Texture[];
  /** Where the cupcake stands to board (city px) — the seaward end of the deck. */
  boardPx: { x: number; y: number };
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Build the dock. `originPx` is the cove's seaward (east) edge midpoint, the
 * same anchor the Sprinkle Shore pier uses.
 */
export function makeSubDock(
  THREE: ThreeNS,
  opts: {
    originPx: { x: number; y: number };
    waterY: number;
    /** City-space bearing out to sea, radians. Derived by the caller from the
     *  island's own shoreline -- never a literal. */
    headingRad: number;
  },
): SubDock {
  const { originPx, waterY, headingRad } = opts;
  const ux = Math.cos(headingRad);
  const uy = Math.sin(headingRad);
  const vx = -Math.sin(headingRad);
  const vy = Math.cos(headingRad);
  /** City-px point `d` along the jetty, `off` across it. */
  const at = (d: number, off = 0): { x: number; y: number } => ({
    x: originPx.x + ux * d + vx * off,
    y: originPx.y + uy * d + vy * off,
  });
  // Same convention as makeBridge: a city bearing is a NEGATIVE scene yaw.
  const yaw = -headingRad;
  const group = new THREE.Group();
  group.name = 'Submarine dock';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const push = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) {
      geometries.push(x as THREE.BufferGeometry);
    } else {
      materials.push(x as THREE.Material);
    }
    return x;
  };

  // ---- The jetty. boothCount 0: nothing stands on it but the kid. ----
  const jetty = makePier(THREE, {
    originPx,
    lengthPx: JETTY_LENGTH_PX,
    halfWidthPx: JETTY_HALF_W_PX,
    waterY,
    boothCount: 0,
    headingRad,
  });
  group.add(jetty.group);
  jetty.geometries.forEach((g) => geometries.push(g));
  jetty.materials.forEach((m) => materials.push(m));

  // ---- Sub-Cake One, moored alongside the deck's seaward end. ----
  // A SMALLER echo of the real submarine in src/lib/deep/submarine.ts, built
  // from the same palette so the thing you board and the thing you drive read
  // as one vehicle. It is deliberately NOT the same module: that one carries a
  // flight model, headlights and a collision clamp, none of which mean anything
  // tied to a plank in a cove.
  const boardPx = at(JETTY_LENGTH_PX * 0.86);
  // Moored clear of the now-narrower deck, ACROSS the jetty rather than in +y
  // -- on a turned deck those are different directions, and using +y would
  // have parked the sub diagonally through the planks.
  const moor = at(JETTY_LENGTH_PX * 0.86, JETTY_HALF_W_PX + 46);
  const sz = pxToSceneZ(moor.y);
  const sub = new THREE.Group();
  sub.name = 'Sub-Cake One (moored)';
  // The thing a kid is meant to walk out and BOARD should be the biggest
  // object in the cove. It was a bath toy at 1.0 and still small at 1.5.
  sub.scale.setScalar(2.2);
  // Riding ON the surface rather than sunk into it. The hull is VANILLA_DEEP
  // -- the same pale yellow as the drivable sub, which is the point -- and
  // pale yellow half-submerged in pale water beside pale sand is why it could
  // not be found. Floating it proud is most of the fix.
  sub.position.set(pxToSceneX(moor.x), waterY + 0.22, sz);
  // Lying ALONG the jetty, whatever bearing that is now.
  sub.rotation.y = yaw + Math.PI / 2;

  const hullGeo = push(new THREE.CapsuleGeometry(0.62, 1.5, 6, 14));
  hullGeo.rotateX(Math.PI / 2);
  sub.add(new THREE.Mesh(hullGeo, push(cakeMat(THREE, CAKE.VANILLA_DEEP))));

  const stripeGeo = push(new THREE.TorusGeometry(0.63, 0.07, 8, 20));
  const stripe = new THREE.Mesh(stripeGeo, push(frostingMat(THREE, CAKE.FROSTING)));
  stripe.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  sub.add(stripe);

  const canopyGeo = push(new THREE.SphereGeometry(0.45, 14, 10));
  const canopy = new THREE.Mesh(canopyGeo, push(candyGlassMat(THREE, 0x7dd3fc, 0.42)));
  canopy.position.set(0, 0.36, -0.5);
  sub.add(canopy);

  const towerGeo = push(new THREE.CylinderGeometry(0.18, 0.24, 0.4, 10));
  const tower = new THREE.Mesh(towerGeo, push(cakeMat(THREE, CAKE.STRAWBERRY)));
  tower.position.set(0, 0.58, 0.22);
  sub.add(tower);

  const cherryGeo = push(new THREE.SphereGeometry(0.15, 10, 8));
  const cherry = new THREE.Mesh(cherryGeo, push(candyMat(THREE, CAKE.STRAWBERRY_DEEP)));
  cherry.position.set(0, 0.84, 0.22);
  sub.add(cherry);

  // ---- Mint tail fins. ----
  // The drivable sub has these (deep/submarine.ts) and the moored one never
  // did, so they close the gap between the two rather than widening it -- and
  // mint is the only cool colour on the model, which is what makes it findable
  // against cream sand.
  //
  // OUTSIDE THE HULL, and this is the trap: the hull is a capsule of radius
  // 0.62, so anything at |x| < 0.62 is INSIDE it. Fins buried in the hull is a
  // defect this world has actually shipped before.
  const finGeo = push(new THREE.BoxGeometry(0.1, 0.62, 0.52));
  const finMat = push(candyMat(THREE, RIBBON.MINT));
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.set(side * 0.72, 0.06, 1.0);
    sub.add(fin);
  }

  // ---- Periscope and a little flag. ----
  // Height is what a kid actually sees from the arch at the top of the cove:
  // the hull sits low and half of it is behind the deck, but a mast breaks the
  // waterline from a long way off.
  const mastGeo = push(new THREE.CylinderGeometry(0.05, 0.06, 1.05, 8));
  const mast = new THREE.Mesh(mastGeo, push(cakeMat(THREE, CAKE.VANILLA_DEEP)));
  mast.position.set(0, 1.28, 0.22);
  sub.add(mast);
  const flagGeo = push(new THREE.BoxGeometry(0.44, 0.28, 0.03));
  const flag = new THREE.Mesh(flagGeo, push(candyMat(THREE, RIBBON.BLUE)));
  flag.position.set(0.24, 1.66, 0.22);
  sub.add(flag);

  group.add(sub);

  // ---- A soft halo on the water. ----
  // The same trick the cove's own landmark uses. Not a marker arrow -- the
  // deep deliberately has none of those -- just enough lift to separate a pale
  // hull from pale water at distance.
  const halo = glowSprite(THREE, RIBBON.BLUE, 3.4);
  halo.sprite.position.set(pxToSceneX(moor.x), waterY + 0.05, sz);
  group.add(halo.sprite);
  // Caller owns disposal, same contract as the sign's texture above.
  textures.push(halo.tex);
  materials.push(halo.mat);

  // ---- A SIGN. ----
  // The pier shipped with nothing naming it, and the result was that nobody
  // could tell what it was for: every other destination in this town announces
  // itself with a board or an arch, and this one looked like spare planks. A
  // sign is what turns a structure into a place you are meant to go.
  const signAt = at(JETTY_LENGTH_PX * 0.14, -JETTY_HALF_W_PX * 0.7);
  const signX = signAt.x;
  const signZ = signAt.y;
  const SIGN_Y = 1.6;
  const sign = makeBoothSign(THREE, 'Sub-Cake One', RIBBON.BLUE, RIBBON.BLUE_DEEP);
  sign.group.position.set(pxToSceneX(signX), SIGN_Y, pxToSceneZ(signZ));
  // Turn the FACE back down the pier, toward the kid walking out along it.
  // +PI/2 puts the board edge-on and shows its blank blue back, which is what
  // the first attempt did.
  sign.group.rotation.y = yaw - Math.PI * 0.5;
  group.add(sign.group);

  // A post, so the board is standing on the pier rather than hovering over it.
  const postGeo = push(new THREE.CylinderGeometry(0.09, 0.11, SIGN_Y, 8));
  const post = new THREE.Mesh(postGeo, push(cookieMat(THREE, WOOD.PLANK)));
  post.position.set(pxToSceneX(signX), SIGN_Y / 2, pxToSceneZ(signZ));
  group.add(post);
  sign.geometries.forEach((g) => geometries.push(g));
  sign.materials.forEach((m) => materials.push(m));
  sign.textures.forEach((t) => textures.push(t));

  // ---- Two mooring bollards, so the sub reads as TIED UP rather than parked. ----
  const bollardGeo = push(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 8));
  const bollardMat = push(candyMat(THREE, RIBBON.AMBER));
  for (const along of [0.55, 0.95]) {
    const b = new THREE.Mesh(bollardGeo, bollardMat);
    const bp = at(JETTY_LENGTH_PX * along, JETTY_HALF_W_PX * 0.55);
    b.position.set(pxToSceneX(bp.x), 0.25, pxToSceneZ(bp.y));
    group.add(b);
  }

  return { group, containsPx: jetty.containsPx, boardPx, geometries, materials, textures };
}
