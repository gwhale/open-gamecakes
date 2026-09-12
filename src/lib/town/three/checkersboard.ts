// Chess Island's WEST wing — the walk-on checkers board.
//
// The island carries two arenas now, one per wing, with the king landmark and
// the plaza between them: chess east at +1800, checkers west at -1800. The
// Cakey Checkers booth stands at this board's edge and faces it, the way the
// Chess Challenge booth faces the eastern board. That pairing is the whole
// point of the wing — a booth alone on open grass reads as a stray building,
// not a section.
//
// Like its eastern sibling this is a TOY, not a game: nothing enforces checkers
// rules and nothing tracks a position. Tap the booth to play the real thing.
//
// ── WHY THIS IS A SIBLING MODULE AND NOT A FLAG ON chessboard.ts ────────────
// The two boards share a footprint convention and nothing else. Chess pieces are
// six lathe profiles that HINGE AT THEIR BASE and topple; a draughtsman is a
// flat disc, and a disc that "falls over" reads as a bug. So the physics differ
// in kind, not degree — see the note on scatter below. Parameterising one module
// to do both would mean a piece-kind union, two physics paths and two piece
// tables behind a boolean, which is worse than two files that each do one thing.
//
// ── THE FOUR THINGS WORTH KNOWING ───────────────────────────────────────────
//
//  1. DISCS SCATTER, THEY DO NOT TOPPLE. Barging a checker shoves it across the
//     board with friction and a spin, and after RETURN_AFTER_MS it glides back
//     to its home square. That is the disc-shaped analogue of the chess board's
//     topple-and-restand, and it is why there is no tilt state here at all.
//
//  2. THEY MUST COME HOME. A disc has no upright/fallen distinction to restore,
//     so without the glide-home the board erodes: one kid running laps leaves
//     24 checkers in the grass permanently, and the arena stops reading as a
//     board. The chess board gets this for free from RESTAND_AFTER_MS.
//
//  3. BOARD_PX IS 1200, NOT 1400, AND THAT IS DELIBERATE. Room is no longer the
//     constraint — the island's sizeMul grew to 4.4328 and a full 1400 board out
//     here lands at nd 0.681, comfortably inside the 0.82 sand line. It is
//     smaller because chess is still the island's headline arena and two equal
//     boards would compete. This is a composition call, not a clearance one.
//
//  4. COLOURS COME FROM THE ACTUAL GAME. Play squares are ROAD_COCOA and idle
//     squares VANILLA — the same SQUARE_PLAY/SQUARE_IDLE the Cakey Checkers
//     board renders with, so walking onto the arena and tapping into the game
//     look like the same place. Do NOT reuse the chess board's cream/licorice
//     here; the two wings are meant to read as different rooms.
//
// No runtime `three` import — the namespace is passed in, matching every other
// module in this directory so the engine stays out of the server bundle.

import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';
import { CAKE } from '@/lib/games/theme/palette';
import { SQUARE_IDLE, SQUARE_PLAY } from '@/lib/games/checkers/types';

type THREENS = typeof import('three');
type Group = import('three').Group;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;
type Texture = import('three').Texture;
type Scene = import('three').Scene;

/** Board footprint (px), 8 squares of 150. Smaller than chess's 1400 on
 *  purpose — see note 3 in the header. */
export const CHECKERS_BOARD_PX = 1200;
const SQUARE_PX = CHECKERS_BOARD_PX / 8;

/** How far the board sits WEST of the island centre. Negative mirrors the chess
 *  board's +1800, so the two arenas sit symmetrically about the plaza and the
 *  king landmark keeps the middle.
 *
 *  The magnitude matches chess rather than hugging the plaza because the west
 *  lobe is genuinely tighter than the east — the bean's `fat` term
 *  (1 + 0.2·cos(ang − 0.3)) swells it eastward, so the same offset and a
 *  smaller board still lands further out in nd terms (0.644 here vs 0.502 for
 *  chess). Verified against the real bean, not estimated. Pushing past ~2200
 *  starts beaching the far corner. */
const BOARD_OFFSET_PX = -1800;

/** Surface heights (scene units) — the SAME LADDER as chessboard.ts, and it
 *  must stay that way. Offshore terrain is flat at y=0, this repo has no
 *  polygonOffset and exactly one renderOrder, so separation is purely
 *  geometric. Two opaque faces sharing a y z-fight and the board flickers as the
 *  camera moves.
 *
 *    slab     centred 0.0,   0.12 tall  → spans -0.06 … 0.06
 *    surface  centred 0.075, 0.06 tall  → spans  0.045 … 0.105  (0.045u proud) */
const Y_SLAB = 0.0;
const SLAB_H = 0.12;
const Y_SURFACE = 0.075;
const SURFACE_H = 0.06;

/** Disc dimensions in scene units. A checker is knee-height on the cupcake
 *  rather than shoulder-height like a chess piece — the joke here is not
 *  shouldering something bigger than you over, it is kicking a puck. */
const DISC_R_U = (SQUARE_PX * 0.40) / PX_PER_UNIT;
const DISC_H_U = 0.34;
const Y_DISC = Y_SURFACE + SURFACE_H / 2 + DISC_H_U / 2;

/** Avatar-centre → disc-centre distance that counts as a kick. Derived from the
 *  disc's own footprint so resizing can't leave the avatar clipping through one
 *  before it reacts. */
const BUMP_PX = DISC_R_U * PX_PER_UNIT + 26;
/** Shove imparted by walking into a disc (px/sec). Livelier than the chess
 *  board's ground-nudge: an untoppled disc is meant to skate. */
const KICK_PX = 300;
const FRICTION = 2.9;
/** Spin imparted per unit of speed, rad/sec. Cosmetic, but a disc that slides
 *  without rotating reads as a decal rather than an object. */
const SPIN_PER_PX = 0.016;
/** How long a displaced disc stays where it was kicked before gliding home. */
const RETURN_AFTER_MS = 12_000;
/** Seconds the glide home takes. */
const RETURN_SECS = 1.1;
/** Within this many px of home, a disc counts as home. */
const HOME_EPS_PX = 2;

interface Disc {
  group: Group;
  /** World px. Discs slide, so this is not fixed. */
  x: number;
  y: number;
  /** Home square centre, world px — where it glides back to. */
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  spin: number;
  /** Timestamp (ms) the disc came to rest away from home, or null. */
  restedAt: number | null;
  /** Glide-home interpolation, 0→1 while returning, else null. */
  returning: number | null;
  returnFromX: number;
  returnFromY: number;
  /** Debounce so one walk-through fires one kick, not one per frame. */
  hot: boolean;
}

export interface CheckersBoardHandle {
  /** Board footprint in world px — the engine keeps scenery off it. */
  rect: { x0: number; y0: number; x1: number; y1: number };
  update(dtMs: number, avatarPx: { x: number; y: number }, now: number): void;
  /** Send every disc straight home immediately. */
  reset(): void;
  dispose(): void;
}

export interface CheckersBoardOpts {
  /** Island centre in world px (the board is offset from here). */
  centerPx: { x: number; y: number };
  /** Fired once per disc kicked, for the thud. */
  onKick?: () => void;
}

/** The board's footprint in world px, given the island centre.
 *
 *  Pure and THREE-free for the same reason chessBoardRectPx is: the engine
 *  assembles its flat/no-scatter rect list long before it builds any board, so
 *  it needs the footprint before there is a mesh to ask. buildCheckersBoard uses
 *  this too, so the rect it hands back and the rect the engine reserves cannot
 *  drift apart. Without the reservation, lollipop trees and gumdrops scatter on
 *  top of the arena. */
export function checkersBoardRectPx(centerPx: { x: number; y: number }): {
  x0: number; y0: number; x1: number; y1: number;
} {
  const cx = centerPx.x + BOARD_OFFSET_PX;
  const half = CHECKERS_BOARD_PX / 2;
  return { x0: cx - half, y0: centerPx.y - half, x1: cx + half, y1: centerPx.y + half };
}

/** Where the Cakey Checkers booth should stand: at the board's EAST edge,
 *  facing the arena, mirroring how Chess Challenge fronts the eastern board.
 *
 *  Exported so city3d places the booth from the board's own geometry rather
 *  than from a second hardcoded offset that would drift the moment this board
 *  moves. */
export function checkersBoothAnchorPx(centerPx: { x: number; y: number }): { x: number; y: number } {
  const r = checkersBoardRectPx(centerPx);
  return { x: r.x1 + 300, y: centerPx.y };
}

export function buildCheckersBoard(
  THREE: THREENS,
  scene: Scene,
  opts: CheckersBoardOpts,
): CheckersBoardHandle {
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texes: Texture[] = [];
  const track = <T>(bin: T[], item: T): T => {
    bin.push(item);
    return item;
  };

  const cx = opts.centerPx.x + BOARD_OFFSET_PX;
  const cy = opts.centerPx.y;
  const rect = checkersBoardRectPx(opts.centerPx);

  const root = new THREE.Group();
  scene.add(root);

  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

  // ---- The board surface -------------------------------------------------
  // One canvas texture rather than 64 meshes, same as the chess board. 1024 for
  // the same reason: at 1200px on a side, 512 works out to well under a texel
  // per world px and the square edges go soft.
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 1024;
  const g2 = cv.getContext('2d')!;
  const cell = cv.width / 8;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      // Checkers is played on ONE colour of square, so the playable cocoa is
      // the figure and vanilla is the ground — the inverse emphasis of a chess
      // board, and the reason this reads as a different game from a distance.
      g2.fillStyle = (f + r) % 2 === 1 ? hex(SQUARE_PLAY) : hex(SQUARE_IDLE);
      g2.fillRect(f * cell, r * cell, cell + 1, cell + 1);
    }
  }
  g2.strokeStyle = 'rgba(69,26,3,0.85)';
  g2.lineWidth = 20;
  g2.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  const boardTex = track(texes, new THREE.CanvasTexture(cv));
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 4;

  const boardU = CHECKERS_BOARD_PX / PX_PER_UNIT;

  // Shallow slab first, so the board has thickness from a low camera.
  const rimU = boardU + 0.5;
  const slabGeo = track(geos, new THREE.BoxGeometry(rimU, SLAB_H, rimU));
  const slabMat = track(mats, new THREE.MeshStandardMaterial({ color: CAKE.CHOCOLATE, roughness: 0.8 }));
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.set(pxToSceneX(cx), Y_SLAB, pxToSceneZ(cy));
  slab.receiveShadow = true;
  root.add(slab);

  const surfGeo = track(geos, new THREE.BoxGeometry(boardU, SURFACE_H, boardU));
  const surfMat = track(mats, new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.72 }));
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.position.set(pxToSceneX(cx), Y_SURFACE, pxToSceneZ(cy));
  surface.receiveShadow = true;
  root.add(surface);

  /** Centre of a square in world px. File 0 = west, rank 0 = north. */
  const squarePx = (file: number, rank: number): { x: number; y: number } => ({
    x: cx - CHECKERS_BOARD_PX / 2 + (file + 0.5) * SQUARE_PX,
    y: cy - CHECKERS_BOARD_PX / 2 + (rank + 0.5) * SQUARE_PX,
  });

  // ---- The 24 discs ------------------------------------------------------
  // GEOMETRY IS SHARED: one cylinder and one crown ring cover all 24, plus two
  // materials. Per-disc geometry would be 24 uploads for no visual gain, and
  // this has to stay smooth on an iPad.
  const discGeo = track(geos, new THREE.CylinderGeometry(DISC_R_U, DISC_R_U, DISC_H_U, 22));
  const ringGeo = track(geos, new THREE.TorusGeometry(DISC_R_U * 0.55, DISC_R_U * 0.13, 8, 20));
  // Bodies match the Cakey Checkers piece sets: chocolate dark, cream light.
  const darkMat = track(mats, new THREE.MeshStandardMaterial({ color: CAKE.CHOCOLATE_DEEP, roughness: 0.55 }));
  const lightMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff6e2, roughness: 0.55 }));
  const darkAccent = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff6e2, roughness: 0.4 }));
  const lightAccent = track(mats, new THREE.MeshStandardMaterial({ color: CAKE.CHOCOLATE_DEEP, roughness: 0.4 }));

  const discs: Disc[] = [];

  const makeDisc = (file: number, rank: number, dark: boolean): void => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(discGeo, dark ? darkMat : lightMat);
    body.castShadow = true;
    g.add(body);
    // A laid-flat ring on the face, so a disc reads as a draughtsman rather than
    // a plain puck — the same "rim or band" language the game's piece styles use.
    const ring = new THREE.Mesh(ringGeo, dark ? darkAccent : lightAccent);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = DISC_H_U / 2 + 0.01;
    g.add(ring);

    const sq = squarePx(file, rank);
    g.position.set(pxToSceneX(sq.x), Y_DISC, pxToSceneZ(sq.y));
    root.add(g);
    discs.push({
      group: g,
      x: sq.x, y: sq.y,
      homeX: sq.x, homeY: sq.y,
      vx: 0, vy: 0, spin: 0,
      restedAt: null, returning: null,
      returnFromX: sq.x, returnFromY: sq.y,
      hot: false,
    });
  };

  // Standard opening layout: 12 a side on the playable squares of the outer
  // three ranks. `(f + r) % 2 === 1` matches the cocoa squares painted above —
  // if you change one, change both or the discs sit on the vanilla.
  for (let rank = 0; rank < 8; rank++) {
    if (rank === 3 || rank === 4) continue;
    for (let file = 0; file < 8; file++) {
      if ((file + rank) % 2 !== 1) continue;
      makeDisc(file, rank, rank < 3);
    }
  }

  const sync = (d: Disc): void => {
    d.group.position.x = pxToSceneX(d.x);
    d.group.position.z = pxToSceneZ(d.y);
    d.group.rotation.y = d.spin;
  };

  const update = (dtMs: number, avatar: { x: number; y: number }, now: number): void => {
    const dt = Math.min(dtMs, 50) / 1000; // clamp: a tab-switch stall must not fling discs
    for (const d of discs) {
      const dx = d.x - avatar.x;
      const dy = d.y - avatar.y;
      const dist = Math.hypot(dx, dy);
      const touching = dist < BUMP_PX && dist > 0.001;

      if (touching && !d.hot) {
        d.hot = true;
        d.vx += (dx / dist) * KICK_PX;
        d.vy += (dy / dist) * KICK_PX;
        // A kick interrupts a glide home — being shoved mid-return should feel
        // like the disc is yours again, not like it is on rails.
        d.returning = null;
        d.restedAt = null;
        opts.onKick?.();
      } else if (!touching && dist > BUMP_PX + 10) {
        d.hot = false;
      }

      if (d.returning !== null) {
        d.returning = Math.min(1, d.returning + dt / RETURN_SECS);
        // Ease-out so the disc settles rather than snapping onto its square.
        const t = 1 - (1 - d.returning) ** 3;
        d.x = d.returnFromX + (d.homeX - d.returnFromX) * t;
        d.y = d.returnFromY + (d.homeY - d.returnFromY) * t;
        d.spin += dt * 1.4;
        if (d.returning >= 1) {
          d.returning = null;
          d.x = d.homeX;
          d.y = d.homeY;
        }
      } else if (d.vx !== 0 || d.vy !== 0) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.spin += Math.hypot(d.vx, d.vy) * SPIN_PER_PX * dt;
        const decay = Math.exp(-FRICTION * dt);
        d.vx *= decay;
        d.vy *= decay;
        if (Math.abs(d.vx) < 1 && Math.abs(d.vy) < 1) {
          d.vx = 0;
          d.vy = 0;
          // Only start the return clock once it has actually stopped, and only
          // if it stopped somewhere other than home.
          d.restedAt = Math.hypot(d.x - d.homeX, d.y - d.homeY) > HOME_EPS_PX ? now : null;
        }
      } else if (d.restedAt !== null && now - d.restedAt > RETURN_AFTER_MS) {
        d.restedAt = null;
        d.returning = 0;
        d.returnFromX = d.x;
        d.returnFromY = d.y;
      }

      sync(d);
    }
  };

  const reset = (): void => {
    for (const d of discs) {
      d.x = d.homeX;
      d.y = d.homeY;
      d.vx = 0;
      d.vy = 0;
      d.spin = 0;
      d.restedAt = null;
      d.returning = null;
      sync(d);
    }
  };

  const dispose = (): void => {
    scene.remove(root);
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const t of texes) t.dispose();
  };

  return { rect, update, reset, dispose };
}
