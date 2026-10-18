// Chess Island's walk-on board — a full 8×8 board laid into the ground, with 32
// kid-height pieces you can knock over by running into them. It is the island's
// arena: the Chess Challenge booth stands at its western edge and faces it.
//
// It is a TOY, not a game: nothing enforces chess rules and nothing tracks a
// position. The whole point is that the pieces are as tall as the cupcake and
// they fall over when you barge into them.
//
// Three things worth knowing before editing:
//
//  1. PIECES HINGE AT THEIR BASE. Each piece is a Group whose origin sits on the
//     ground with the mesh built upward from y=0, so rotating the group tips the
//     piece about the edge it actually stands on. Rotating a centred mesh would
//     make it pivot through the floor.
//
//  2. TERRAIN IS ALREADY FLAT OUT HERE. Offshore islands fall outside
//     MAINLAND_B, so terrainHeightPx returns flat ground for them (see the
//     comment in engine.ts's terrain fade). The board needs no flatRects entry —
//     adding one would be dead weight.
//
//  3. GEOMETRY IS SHARED. Six lathe profiles and two materials cover all 32
//     pieces. Per-piece geometry would be 32 uploads for no visual gain, and
//     this has to stay smooth on an iPad.
//
// No runtime `three` import — the namespace is passed in, matching every other
// module in this directory so the engine stays out of the server bundle.

import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';
import { CAKE } from '@/lib/games/theme/palette';

type THREENS = typeof import('three');
type Group = import('three').Group;
type Mesh = import('three').Mesh;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;
type Texture = import('three').Texture;
type Scene = import('three').Scene;

/** Board footprint (px), 8 squares of 175. This is the island's ARENA — the
 *  venue the Chess Challenge booth faces — so it is deliberately the largest
 *  object out here.
 *
 *  1400 is not a taste pick, it is the ceiling. The board sits east of the
 *  plaza, so its far corner is the binding constraint: at BOARD_OFFSET_PX below,
 *  1400 puts that corner at nd 0.817, just inside the 0.82 line where grass
 *  gives way to sand. 1500 lands on 0.866 and 1600 on 0.911 — visibly beached.
 *  If the pieces ever read as too big, shrink PIECE_SCALE, not this. */
export const BOARD_PX = 1400;
const SQUARE_PX = BOARD_PX / 8;

/** How far the board sits east of the island centre, so the king landmark keeps
 *  the middle and the board lies beside it rather than through it.
 *
 *  Was 560 against a 800px board, which put the slab's west edge 144px out —
 *  INSIDE the region's checker pad (half-width 163px), so the pad's top face
 *  visibly buried the board's west rank. Two checkerboards at different scales,
 *  intersecting.
 *
 *  1800 puts ~757px of open grass between the pad and the board's west edge and
 *  leaves a ~590px walking lane past the eastern game booth. Pushing the board
 *  out is only HALF of what gives it room — the other half is the island's
 *  sizeMul in islands.ts, and the two are tuned together against the board's
 *  far-corner nd. Note it is THIS number, not the island size, that sets how far
 *  a kid walks to reach the arena (~11s at WALK_SPEED_PX), so grow the island
 *  freely but move this with care. */
const BOARD_OFFSET_PX = 1800;

/** Surface heights (scene units). Offshore terrain is flat at y=0 out here, so
 *  these are absolute, and they are a LADDER: no two faces in this stack may
 *  share a y, or the two opaque surfaces z-fight and the whole board flickers as
 *  the camera moves. That is exactly the bug this ladder replaced — a zero-height
 *  plane sat at 0.06, and the slab's top face landed at 0.06 too.
 *
 *  This repo has no polygonOffset and exactly one renderOrder (the skydome), so
 *  separation is geometric, the same way race-isle.ts stacks its tarmac/paint/kerb
 *  and ferry.ts floats its dock stripe. Keep it that way.
 *
 *    slab     centred 0.0,   0.12 tall  → spans -0.06 … 0.06
 *    surface  centred 0.075, 0.06 tall  → spans  0.045 … 0.105  (0.045u proud) */
const Y_SLAB = 0.0;
const SLAB_H = 0.12;
const Y_SURFACE = 0.075;
const SURFACE_H = 0.06;
/** Pieces stand ON the playing surface. Derived, so re-tuning the ladder above
 *  can't leave 32 pieces hovering over the board or sunk into it. */
const Y_PIECE = Y_SURFACE + SURFACE_H / 2;

/** Piece size as a fraction of a square. Pieces stand taller than the cupcake
 *  on purpose — shouldering over something bigger than you is the whole joke.
 *  The widest profile (king, r=0.37) reaches 69% of a square at this scale, so
 *  neighbours on adjacent files still have clear air between them.
 *
 *  Note this is a fraction of a SQUARE, so it followed the board up to 175px:
 *  the king now stands ~3.9 units, better than twice the avatar. That is the
 *  intent for an arena you walk into — but it is the knob to turn if it reads as
 *  absurd, because BOARD_PX itself is pinned by the shoreline. */
const PIECE_SCALE = 0.93;

/** Avatar-centre → piece-centre distance that counts as a barge. Derived from
 *  the piece's own footprint rather than fixed, so resizing pieces can't leave
 *  the avatar visually clipping through one before it decides to fall. */
const PIECE_BASE_R_PX = 0.37 * PIECE_SCALE * SQUARE_PX;
const BUMP_PX = PIECE_BASE_R_PX + 22;
/** Radians/sec² the topple accelerates at once it starts going. */
const TOPPLE_ACCEL = 11;
/** A piece is down at 90°. */
const DOWN = Math.PI / 2;
/** How long a piece lies there before it quietly stands back up (ms). */
const RESTAND_AFTER_MS = 30_000;
/** Seconds the stand-up animation takes. */
const RESTAND_SECS = 0.9;
/** Ground shove applied to an already-fallen piece you walk into (px/sec). */
const NUDGE_PX = 90;
const NUDGE_FRICTION = 2.6;

type PieceKind = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';

interface Piece {
  group: Group;
  /** World px — pieces slide when nudged, so this is not fixed. */
  x: number;
  y: number;
  /** Ground velocity (px/sec) while being shoved around. */
  vx: number;
  vy: number;
  /** 0 = upright, DOWN = flat. */
  tilt: number;
  tiltVel: number;
  /** Unit direction the piece falls toward, in world px space. */
  fallX: number;
  fallY: number;
  /** Timestamp (ms) the piece finished falling, or null while upright. */
  downAt: number | null;
  /** True while animating back upright, so a bump can't re-topple mid-rise. */
  rising: boolean;
  /** Debounce so one walk-through fires one thud, not one per frame. */
  hot: boolean;
}

export interface ChessBoardHandle {
  /** Board footprint in world px — the engine uses this to keep scenery off it. */
  rect: { x0: number; y0: number; x1: number; y1: number };
  /** Drive the physics. `dtMs` is the loop delta; `now` is performance.now(). */
  update(dtMs: number, avatarPx: { x: number; y: number }, now: number): void;
  /** Stand every piece back up immediately. */
  reset(): void;
  dispose(): void;
}

export interface ChessBoardOpts {
  /** Island centre in world px (the board is offset from here). */
  centerPx: { x: number; y: number };
  /** Fired once per piece knocked over, for the thud. */
  onTopple?: () => void;
}

/** Silhouette for each piece as a lathe profile: [radius, height] pairs walking
 *  up from the base. Kept low-poly on purpose — these read at a distance as
 *  chess pieces, and 32 of them have to stay cheap. Heights are scene units;
 *  a pawn is roughly cupcake-height so toppling one feels like shouldering a
 *  person over, which is the entire joke. */
const PROFILES: Record<PieceKind, Array<[number, number]>> = {
  pawn: [[0.30, 0], [0.30, 0.10], [0.19, 0.16], [0.15, 0.42], [0.24, 0.52], [0.20, 0.58], [0.22, 0.72], [0.0, 0.94]],
  rook: [[0.32, 0], [0.32, 0.11], [0.21, 0.18], [0.20, 0.72], [0.30, 0.80], [0.30, 1.02], [0.22, 1.02], [0.0, 1.04]],
  knight: [[0.32, 0], [0.32, 0.11], [0.21, 0.18], [0.19, 0.62], [0.26, 0.72], [0.20, 0.86], [0.0, 0.96]],
  bishop: [[0.31, 0], [0.31, 0.11], [0.20, 0.18], [0.16, 0.70], [0.26, 0.82], [0.14, 1.00], [0.11, 1.12], [0.0, 1.26]],
  queen: [[0.36, 0], [0.36, 0.12], [0.23, 0.20], [0.18, 0.86], [0.32, 1.00], [0.22, 1.16], [0.16, 1.34], [0.0, 1.46]],
  king: [[0.37, 0], [0.37, 0.12], [0.24, 0.20], [0.19, 0.94], [0.33, 1.08], [0.22, 1.24], [0.18, 1.42], [0.0, 1.52]],
};

/** Back rank, files a→h. */
const BACK_RANK: PieceKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

/** The board's footprint in world px, given the island centre.
 *
 *  Pure and THREE-free on purpose: the engine assembles its flat/no-scatter rect
 *  list ~1,400 lines before it builds the board, so it needs the footprint long
 *  before there is a mesh to ask. buildChessBoard uses this too, so the rect it
 *  hands back and the rect the engine reserves cannot drift apart. */
export function chessBoardRectPx(centerPx: { x: number; y: number }): {
  x0: number; y0: number; x1: number; y1: number;
} {
  const cx = centerPx.x + BOARD_OFFSET_PX;
  const half = BOARD_PX / 2;
  return { x0: cx - half, y0: centerPx.y - half, x1: cx + half, y1: centerPx.y + half };
}

export function buildChessBoard(
  THREE: THREENS,
  scene: Scene,
  opts: ChessBoardOpts,
): ChessBoardHandle {
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texes: Texture[] = [];
  const track = <T>(bin: T[], item: T): T => {
    bin.push(item);
    return item;
  };

  const cx = opts.centerPx.x + BOARD_OFFSET_PX;
  const cy = opts.centerPx.y;
  const rect = chessBoardRectPx(opts.centerPx);

  const root = new THREE.Group();
  scene.add(root);

  // ---- The board surface -------------------------------------------------
  // One canvas texture rather than 64 meshes. Cream and licorice to match the
  // the island's existing checker pad and the king landmark.
  // 1024, not 512: the board is 1400px on a side in world space, so 512 works out
  // to 0.37 texels per px and the square edges go soft. One texture either way.
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 1024;
  const g2 = cv.getContext('2d')!;
  const cell = cv.width / 8;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      g2.fillStyle = (f + r) % 2 === 0 ? '#fef3c7' : '#5a3210';
      g2.fillRect(f * cell, r * cell, cell + 1, cell + 1);
    }
  }
  // Thin inlay border so the board reads as an object, not a painted rectangle.
  // Scaled with the canvas above so the inlay keeps the same apparent thickness.
  g2.strokeStyle = 'rgba(69,26,3,0.85)';
  g2.lineWidth = 20;
  g2.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  const boardTex = track(texes, new THREE.CanvasTexture(cv));
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 4;

  const boardU = BOARD_PX / PX_PER_UNIT;

  // A shallow slab first, so the board has thickness from a low camera.
  const rimU = boardU + 0.5;
  const slabGeo = track(geos, new THREE.BoxGeometry(rimU, SLAB_H, rimU));
  const slabMat = track(mats, new THREE.MeshStandardMaterial({ color: CAKE.CHOCOLATE, roughness: 0.8 }));
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.set(pxToSceneX(cx), Y_SLAB, pxToSceneZ(cy));
  slab.receiveShadow = true;
  root.add(slab);

  // The playing surface, inlaid into the slab. A BOX, not a plane: a plane at the
  // slab's top face is exactly coplanar with it, and two opaque surfaces sharing a
  // depth value z-fight — the whole board flickers as the camera moves. Boxed and
  // laddered, its bottom is buried in the slab and its top stands 0.045u proud, so
  // no two faces ever tie. Every other ground decal in the town is built this way.
  const topGeo = track(geos, new THREE.BoxGeometry(boardU, SURFACE_H, boardU));
  const topMat = track(mats, new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.85 }));
  // Box faces run [+X, -X, +Y, -Y, +Z, -Z]; only the top wears the checker, and the
  // sides reuse the slab's chocolate rather than allocating a second material.
  const top = new THREE.Mesh(topGeo, [slabMat, slabMat, topMat, slabMat, slabMat, slabMat]);
  top.position.set(pxToSceneX(cx), Y_SURFACE, pxToSceneZ(cy));
  top.receiveShadow = true;
  root.add(top);

  // ---- Pieces ------------------------------------------------------------
  const pieceGeo: Record<PieceKind, BufferGeometry> = {} as Record<PieceKind, BufferGeometry>;
  for (const kind of Object.keys(PROFILES) as PieceKind[]) {
    const pts = PROFILES[kind].map(([r, h]) => new THREE.Vector2(Math.max(r, 0.001), h));
    pieceGeo[kind] = track(geos, new THREE.LatheGeometry(pts, 14));
  }
  const creamMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff8e7, roughness: 0.45 }));
  const darkMat = track(mats, new THREE.MeshStandardMaterial({ color: CAKE.CHOCOLATE_DEEP, roughness: 0.35 }));

  const pieces: Piece[] = [];
  const squarePx = (file: number, rank: number) => ({
    x: cx + (file - 3.5) * SQUARE_PX,
    y: cy + (rank - 3.5) * SQUARE_PX,
  });

  const addPiece = (kind: PieceKind, file: number, rank: number, dark: boolean): void => {
    const group = new THREE.Group();
    const mesh: Mesh = new THREE.Mesh(pieceGeo[kind], dark ? darkMat : creamMat);
    mesh.castShadow = true;
    const s = (SQUARE_PX / PX_PER_UNIT) * PIECE_SCALE;
    mesh.scale.setScalar(s);
    group.add(mesh);
    const p = squarePx(file, rank);
    group.position.set(pxToSceneX(p.x), Y_PIECE, pxToSceneZ(p.y));
    root.add(group);
    pieces.push({
      group, x: p.x, y: p.y, vx: 0, vy: 0,
      tilt: 0, tiltVel: 0, fallX: 1, fallY: 0,
      downAt: null, rising: false, hot: false,
    });
  };

  for (let f = 0; f < 8; f++) {
    addPiece('pawn', f, 1, false);
    addPiece('pawn', f, 6, true);
    addPiece(BACK_RANK[f], f, 0, false);
    addPiece(BACK_RANK[f], f, 7, true);
  }

  /** Apply a piece's simulation state to its transform. The group's origin is on
   *  the ground, so this rotation hinges at the base. */
  const sync = (p: Piece): void => {
    p.group.position.x = pxToSceneX(p.x);
    p.group.position.z = pxToSceneZ(p.y);
    // Rotate about the horizontal axis perpendicular to the fall direction.
    p.group.rotation.set(0, 0, 0);
    p.group.rotateOnAxis(
      new THREE.Vector3(p.fallY, 0, -p.fallX).normalize(),
      -p.tilt,
    );
  };

  const update = (dtMs: number, avatar: { x: number; y: number }, now: number): void => {
    const dt = Math.min(dtMs, 50) / 1000; // clamp: a tab-switch stall must not fling pieces
    for (const p of pieces) {
      const dx = p.x - avatar.x;
      const dy = p.y - avatar.y;
      const d = Math.hypot(dx, dy);
      const touching = d < BUMP_PX && d > 0.001;

      if (touching && !p.hot) {
        p.hot = true;
        if (p.tilt <= 0.001 && !p.rising) {
          // Upright and barged: fall AWAY from the avatar.
          p.fallX = dx / d;
          p.fallY = dy / d;
          p.tiltVel = 2.2;
          opts.onTopple?.();
        }
      } else if (!touching && d > BUMP_PX + 10) {
        p.hot = false;
      }
      // A piece already on the ground gets shoved along instead of re-toppled.
      if (touching && p.tilt >= DOWN - 0.02) {
        p.vx += (dx / d) * NUDGE_PX * dt * 6;
        p.vy += (dy / d) * NUDGE_PX * dt * 6;
      }

      if (p.rising) {
        p.tilt -= (DOWN / RESTAND_SECS) * dt;
        if (p.tilt <= 0) {
          p.tilt = 0;
          p.tiltVel = 0;
          p.rising = false;
        }
      } else if (p.tiltVel > 0 || p.tilt > 0) {
        if (p.tilt < DOWN) {
          p.tiltVel += TOPPLE_ACCEL * dt * Math.max(0.25, Math.sin(p.tilt + 0.35));
          p.tilt = Math.min(DOWN, p.tilt + p.tiltVel * dt);
          if (p.tilt >= DOWN) {
            p.tilt = DOWN;
            p.tiltVel = 0;
            p.downAt = now;
          }
        } else if (p.downAt !== null && now - p.downAt > RESTAND_AFTER_MS) {
          p.rising = true;
          p.downAt = null;
          p.vx = 0;
          p.vy = 0;
        }
      }

      if (p.vx !== 0 || p.vy !== 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const decay = Math.exp(-NUDGE_FRICTION * dt);
        p.vx *= decay;
        p.vy *= decay;
        if (Math.abs(p.vx) < 0.5) p.vx = 0;
        if (Math.abs(p.vy) < 0.5) p.vy = 0;
      }

      sync(p);
    }
  };

  const reset = (): void => {
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const file = Math.floor(i / 4);
      const slot = i % 4;
      const rank = slot === 0 ? 1 : slot === 1 ? 6 : slot === 2 ? 0 : 7;
      const sq = squarePx(file, rank);
      p.x = sq.x;
      p.y = sq.y;
      p.vx = 0;
      p.vy = 0;
      p.tilt = 0;
      p.tiltVel = 0;
      p.downAt = null;
      p.rising = false;
      sync(p);
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
