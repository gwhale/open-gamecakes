// TownScene — Gamecakes City explorable map.
//
// Top-down Phaser scene: kid taps anywhere, their avatar walks
// toward the tap target at a fixed speed; camera follows with
// smoothing; world bounds keep the avatar inside the 1024×768 map.
//
// Through PR 5 scope:
//   - All 8 regions render as colored rects (themeColor at half
//     alpha) with their name as a nameplate at center
//   - Avatar emoji on a white circle, walks via tap-to-move
//   - Buildings: each region's games[] becomes a tappable rounded
//     rect inside the region. Tap → walk to it → on arrival emit
//     town:enter-game (host calls router.push('/games/{slug}'))
//   - Fog: undiscovered, non-starter regions get a dark rect
//     overlay with a "?" glyph and a static physics body so the
//     avatar can't enter. When the avatar approaches a fog edge
//     AND the region is adjacent to a discovered one, the scene
//     emits town:approach-fog; the host shows the unlock modal
//     and POSTs to /api/town/discover. On success the host emits
//     town:request-discover back, and the scene tweens the fog
//     away with a sparkle particle burst.
//   - Position emitted to host every 3s if changed (host POSTs
//     to /api/town/position) plus once on shutdown AND once
//     immediately before town:enter-game so the kid respawns
//     where they entered when they return
//
// Asset strategy: zero atlases, zero preloaded images. Buildings
// and avatar all use Phaser.Graphics + Phaser.Text with emoji —
// same pattern as the existing game scenes (Marble Maze, Asteroids,
// etc.). Theme colors come from the catalog so a designer can
// re-skin a region by editing one TS const.

import * as Phaser from 'phaser';
import { TILE_SIZE_PX, WORLD_PX, findRegion } from '@/lib/town/regions';
import { findGame } from '@/lib/games/registry';
import { drawCakeyCloud, drawTree } from '@/lib/games/theme/decor';
import {
  drawNumberChip,
  drawRegionLandmark,
  drawRegionShape,
  drawRibbonBanner,
  drawTitleBanner,
  drawWorldBed,
} from './illustrations';
import { TOWN_SCENE_KEY, type TownSceneProps } from './TownScene.factory';

const WALK_SPEED_PX_PER_SEC = 220;
/** Distance below which we consider the avatar "arrived" and stop
 *  driving velocity. Smaller numbers cause overshoot wobble; larger
 *  ones make the avatar stop short of the tapped tile. */
const ARRIVE_DISTANCE_PX = 4;

const AVATAR_RADIUS_PX = 28;
const AVATAR_FONT_SIZE_PX = 38;

/** How often to push position updates to the server. The scene emits
 *  no more than once per this interval AND only when the avatar
 *  actually moved since the last emit. */
const POSITION_EMIT_INTERVAL_MS = 3000;

// Building visuals — sized to fit two side-by-side inside a 4-tile
// (256 px) wide region with breathing room. Total height is split
// between roof and body inside createBuilding(); the constants here
// only set the outer width and the inner text sizing.
const BUILDING_W_PX = 80;
const BUILDING_GLYPH_FONT_PX = 36;
const BUILDING_LABEL_FONT_PX = 11;
/** Vertical center of the building inside its region rect. 60% from
 *  the top puts it below the nameplate so the two never overlap. */
const BUILDING_VERTICAL_PCT = 0.6;

interface AvatarBundle {
  container: Phaser.GameObjects.Container;
  body: Phaser.Physics.Arcade.Body;
}

interface BuildingHandle {
  /** Display container — also the interactive hit target. */
  container: Phaser.GameObjects.Container;
  /** Game slug from the registry — emitted in town:enter-game. */
  gameSlug: string;
  /** World pixel center. moveTarget is set to this on tap so the
   *  avatar walks to the building before entering. */
  worldX: number;
  worldY: number;
}

interface FogHandle {
  /** The dark rectangle covering the region. Tweened to alpha 0
   *  on unlock, then destroyed. */
  rect: Phaser.GameObjects.Rectangle;
  /** ☁️ emoji centered on the fog. Shares the alpha tween. */
  glyph: Phaser.GameObjects.Text;
  /** "???" label below the cloud. Shares the alpha tween. */
  label: Phaser.GameObjects.Text;
}

// Fog visualization — softer than the original hard zinc-800 rect.
// Slate reads as misty rather than ominous, and the cloud emoji
// + "???" inside the region replaces the bold "?" so undiscovered
// regions feel like "places shrouded in fog" rather than
// "rectangular forbidden zones." Collision body still tracks the
// rect; the cloud is purely decorative.
const FOG_FILL_COLOR = 0x64748b; // slate-500
const FOG_FILL_ALPHA = 0.8;
const FOG_GLYPH_FONT_PX = 48;
const FOG_LABEL_FONT_PX = 18;
const FOG_LABEL_COLOR = '#f8fafc'; // slate-50

// Walking-path connectors between adjacent regions. Wider than v1
// to read more like the prominent walking trails on a Disneyland
// park map. Base is warm tan (the "dirt" of the path); dashed
// overlay flips to white (the Disneyland inspiration uses white
// dashes as a "path is open / accessible" marker).
const PATH_BASE_COLOR = 0xfde68a; // amber-200
const PATH_DASH_COLOR = 0xffffff; // white dashes — Disneyland match
const PATH_WIDTH_PX = 22;
const PATH_DASH_LENGTH_PX = 14;
const PATH_DASH_GAP_PX = 10;

// Game → ride-chip number. Chips are Disney-style numbered disks
// rendered beside each game building. Numbering is sequential left-
// to-right roughly along the map's natural reading order so a parent
// can reference "go play number 7" without ambiguity.
// Decorative only: a missing slug simply renders no chip (see the
// `if (chipNumber)` guard below), so this does not need to cover every game
// and a local game without a number is fine rather than broken. 'math-maze'
// named a game that never shipped; word-flap and water-balloons were retired;
// the two family games moved to registry.local.ts and took their numbers.
const RIDE_NUMBERS: Record<string, number> = {
  'flappy-math':     1,
  'word-memory':     4,
  'marble-maze':     5,
  'sharks-minnows':  7,
  'math-asteroids':  9,
};

/** Distance in pixels at which "approach to unlock" fires. About one
 *  tile — close enough that the kid clearly intends to enter the
 *  region but not so close that the body collision happens first. */
const FOG_APPROACH_DISTANCE_PX = 70;

const SPARKLE_COUNT = 10;
const SPARKLE_FONT_PX = 24;
const SPARKLE_DURATION_MS = 800;
const FOG_FADE_DURATION_MS = 800;

// Minimap inset — pinned upper-right of the world. Phaser.Scale.FIT
// scales the entire canvas, so these coords are in unscaled scene
// space; the minimap lands proportionally on whatever pixel size
// the iPad renders the canvas at.
const MINIMAP_W_PX = 192;
const MINIMAP_H_PX = 144; // 192 × (768/1024) keeps aspect ratio
const MINIMAP_PAD_PX = 16;
const MINIMAP_AVATAR_DOT_RADIUS_SCENE_PX = 36; // big in scene coords so it
// renders ~7 px on the zoomed minimap (36 * 0.1875 ≈ 6.75).

export class TownScene extends Phaser.Scene {
  private sceneProps!: TownSceneProps;
  private hostBus!: Phaser.Events.EventEmitter;

  private avatar!: AvatarBundle;
  private moveTarget: { x: number; y: number } | null = null;

  /** Set to a game slug when the kid tapped a building. On arrival
   *  at the move target, the scene emits town:enter-game with this
   *  slug. Cleared by any subsequent tap on the open map (so the
   *  kid can change their mind by tapping elsewhere mid-walk). */
  private pendingGameSlug: string | null = null;

  private buildings: BuildingHandle[] = [];

  private minimap?: Phaser.Cameras.Scene2D.Camera;
  /** Bright dot rendered only on the minimap (the main camera ignores
   *  it, the minimap ignores the regular avatar emoji). Sized big in
   *  scene coords so it survives the minimap's downscale. */
  private avatarDot?: Phaser.GameObjects.Arc;

  private fogs: Map<string, FogHandle> = new Map();
  /** Mutable copy of the kid's discovered region slugs. The scene
   *  starts with the snapshot from sceneProps; on town:request-discover
   *  the host pushes a new slug here so subsequent approach checks
   *  see the next-tier neighbors as eligible. */
  private discoveredSlugs: Set<string> = new Set();
  /** Slug of the fogged region the avatar is currently within
   *  approach distance of, or null. Used to throttle
   *  town:approach-fog so it fires once per approach session. */
  private currentApproachRegion: string | null = null;

  private lastEmittedX = -1;
  private lastEmittedY = -1;
  /** Tracks which region the avatar is in for the position-update
   *  payload. Updated lazily in update() when the avatar crosses a
   *  region boundary. */
  private currentRegionSlug: string;

  constructor() {
    super(TOWN_SCENE_KEY);
    // Initialized to '' so TS knows the field is set; create() reads
    // sceneProps and overwrites with the real spawn region.
    this.currentRegionSlug = '';
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as TownSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;

    this.currentRegionSlug = this.sceneProps.spawnRegion;
    this.discoveredSlugs = new Set(this.sceneProps.discovered);

    this.physics.world.gravity.set(0, 0);
    this.physics.world.setBounds(0, 0, WORLD_PX.w, WORLD_PX.h);

    // Render order matters — earlier draws sit underneath:
    //   0   world bed (sky strip + grass)
    //   0.5 clouds (drift across sky)
    //   0.6 trees scattered in inter-region gaps
    //   1   path bases between adjacent regions
    //   1.1 path dashes
    //   2   region shape fills (organic per-region silhouettes)
    //   3   region landmark compositions (pedestals, towers, etc.)
    //   4   region ribbon banners
    //   5   buildings (peaked-roof structures)
    //   5.5 numbered ride chips beside buildings
    //   6   fog rects (over undiscovered regions, blocks walking)
    //   7+  avatar (created next, ignores depth — drawn last)
    //   10  title banner ("Gamecakes City") at top center
    drawWorldBed(this, WORLD_PX.w, WORLD_PX.h);
    this.drawScenery();
    this.drawPaths();
    this.drawRegionTiles();
    this.drawRegionLandmarks();
    this.drawRegionNameplates();
    this.drawBuildings();
    this.drawFog();
    drawTitleBanner(this, WORLD_PX.w / 2, 30);

    this.avatar = this.createAvatar(
      this.sceneProps.spawn.x,
      this.sceneProps.spawn.y,
    );

    // Attach colliders AFTER both fogs and avatar exist. Each fog
    // rect already has a static body via drawFog(); this wires the
    // avatar's dynamic body so the collision actually fires.
    for (const fog of this.fogs.values()) {
      this.physics.add.collider(this.avatar.container, fog.rect);
    }

    this.cameras.main.setBounds(0, 0, WORLD_PX.w, WORLD_PX.h);
    this.cameras.main.startFollow(this.avatar.container, true, 0.1, 0.1);

    this.setupMinimap();

    this.input.on('pointerdown', this.onPointerDown, this);

    // Host → scene events. The host calls /api/town/discover and on
    // success emits this back so we run the unlock animation and
    // free the avatar to walk into the new region.
    this.hostBus.on('town:request-discover', (payload: { regionSlug: string }) => {
      this.discoveredSlugs.add(payload.regionSlug);
      this.removeFog(payload.regionSlug);
    });

    // Periodic position sync — runs forever, drops on shutdown via
    // Phaser's automatic timer cleanup. Scene also calls
    // maybeEmitPosition() once explicitly on shutdown to capture the
    // final spot before destroy.
    this.time.addEvent({
      delay: POSITION_EMIT_INTERVAL_MS,
      loop: true,
      callback: () => this.maybeEmitPosition(),
    });

    // Phaser fires SHUTDOWN when the scene is being torn down (parent
    // host destroyed). Last-chance position emit so the kid's spot
    // is saved even on quick exits.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.maybeEmitPosition();
    });
  }

  // ---- World rendering ----

  /** Decorative clouds + trees scattered between regions to make the
   *  map feel like a Disneyland park bed rather than a checklist of
   *  colored shapes. 25+ trees clustered in the gaps + 6 drifting
   *  clouds. Hand-placed to fall outside region tile rects so
   *  scenery never hides a building or fights the path graph.
   *
   *  Region grid (for reference when adding/moving placements):
   *    castle  (8-12, 0-3)  mountain (8-12, 3-6)
   *    library (0-4, 6-9)   cookie  (4-8, 6-9)   frosting (8-12, 6-9)   shore (12-16, 6-9)
   *    square  (4-8, 9-12)  cove    (12-16, 9-12)
   *  Pixel = tile × 64. */
  private drawScenery(): void {
    // Six drifting clouds in the upper sky band (top 230 px).
    const clouds: Array<{ x: number; y: number; scale: number; speed: number }> = [
      { x: 80,   y: 40,  scale: 0.55, speed: 95  },
      { x: 320,  y: 80,  scale: 0.65, speed: 120 },
      { x: 540,  y: 30,  scale: 0.7,  speed: 130 },
      { x: 740,  y: 65,  scale: 0.55, speed: 110 },
      { x: 920,  y: 35,  scale: 0.6,  speed: 140 },
      { x: 200,  y: 160, scale: 0.45, speed: 150 },
    ];
    for (const c of clouds) {
      drawCakeyCloud(this, {
        x: c.x, y: c.y, scale: c.scale,
        driftSpeedSec: c.speed, viewW: WORLD_PX.w, depth: 0.5,
      });
    }

    // 25+ trees in clusters around the map, all in non-region tiles.
    // Cluster placement evokes a forest park rather than a checklist.
    const treeSpots: Array<{ x: number; y: number; scale: number }> = [
      // Top-left forest (above library, west of castle)
      { x: 80,  y: 240, scale: 0.55 }, { x: 150, y: 270, scale: 0.5  },
      { x: 220, y: 230, scale: 0.6  }, { x: 320, y: 290, scale: 0.45 },
      { x: 110, y: 320, scale: 0.5  }, { x: 250, y: 340, scale: 0.55 },
      { x: 390, y: 260, scale: 0.4  },
      // Top-right (north of shore, east of mountain)
      { x: 800,  y: 230, scale: 0.5  }, { x: 870, y: 280, scale: 0.55 },
      { x: 940,  y: 220, scale: 0.6  }, { x: 990, y: 320, scale: 0.45 },
      { x: 760,  y: 340, scale: 0.45 },
      // Bottom-left (south of library, west of square)
      { x: 60,  y: 700, scale: 0.55 }, { x: 130, y: 740, scale: 0.5  },
      { x: 200, y: 720, scale: 0.45 }, { x: 90,  y: 660, scale: 0.5  },
      // Center-bottom (south of square + frosting, west of cove)
      { x: 420, y: 750, scale: 0.55 }, { x: 500, y: 720, scale: 0.5  },
      { x: 580, y: 750, scale: 0.45 }, { x: 660, y: 720, scale: 0.5  },
      { x: 720, y: 760, scale: 0.4  },
      // Right edge (between shore and cove)
      { x: 950, y: 720, scale: 0.5  }, { x: 990, y: 670, scale: 0.45 },
      // Stragglers in odd corners for variety
      { x: 30,  y: 440, scale: 0.4  }, { x: 1000, y: 460, scale: 0.4 },
      { x: 30,  y: 540, scale: 0.4  },
    ];
    for (const spot of treeSpots) {
      drawTree(this, {
        x: spot.x,
        baseY: spot.y,
        scale: spot.scale,
        depth: 0.6,
      });
    }
  }

  /** Curved walking-path connectors between every pair of adjacent
   *  regions. Drawn under the region tiles (depth 1) so the paths
   *  appear to go INTO each region rather than over them. Two
   *  passes: a thick warm-tan base, then dashed amber overlay for
   *  the "trail markers" detail. */
  private drawPaths(): void {
    // De-dupe edges by lexicographic ordering (only draw when
    // region.slug < neighbor.slug). The catalog declares neighbors
    // bidirectionally (square ↔ cookie, etc.) — without dedupe we'd
    // double-draw every edge.
    const drawn = new Set<string>();
    const baseG = this.add.graphics().setDepth(1);
    const dashG = this.add.graphics().setDepth(1.1);

    for (const region of this.sceneProps.regions) {
      for (const neighborSlug of region.neighbors) {
        const edgeKey = [region.slug, neighborSlug].sort().join('|');
        if (drawn.has(edgeKey)) continue;
        drawn.add(edgeKey);

        const neighbor = findRegion(neighborSlug);
        if (!neighbor) continue;

        // Quadratic bezier between the two region centers — the
        // control point sits perpendicular to the midpoint by ~30 px
        // so the path arcs naturally instead of being a straight
        // line. Direction of the arc alternates per edge for visual
        // variety (some paths bow up, others down).
        const ax = region.spawnPoint.x;
        const ay = region.spawnPoint.y;
        const bx = neighbor.spawnPoint.x;
        const by = neighbor.spawnPoint.y;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.sqrt(dx * dx + dy * dy);
        // Perpendicular unit vector for the offset, alternated by
        // hashing the edge key for deterministic-but-varied bowing.
        const sign = (edgeKey.charCodeAt(0) + edgeKey.charCodeAt(edgeKey.length - 1)) % 2 === 0 ? 1 : -1;
        const offset = 36 * sign;
        const cx = mx + (-dy / length) * offset;
        const cy = my + (dx / length) * offset;

        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(ax, ay),
          new Phaser.Math.Vector2(cx, cy),
          new Phaser.Math.Vector2(bx, by),
        );

        // Base thick path — solid warm tan.
        baseG.lineStyle(PATH_WIDTH_PX, PATH_BASE_COLOR, 0.95);
        curve.draw(baseG, 48);

        // Dashed overlay — sample points along the curve and draw
        // short line segments alternating with gaps. The dash count
        // scales with curve length so short paths stay readable.
        const dashCount = Math.max(8, Math.floor(curve.getLength() / (PATH_DASH_LENGTH_PX + PATH_DASH_GAP_PX)));
        dashG.lineStyle(3, PATH_DASH_COLOR, 0.85);
        for (let i = 0; i < dashCount; i++) {
          const t0 = i / dashCount;
          const t1 = t0 + (PATH_DASH_LENGTH_PX / curve.getLength());
          if (t1 > 1) break;
          const p0 = curve.getPoint(t0);
          const p1 = curve.getPoint(t1);
          dashG.lineBetween(p0.x, p0.y, p1.x, p1.y);
        }
      }
    }
  }

  /** Region tiles — delegate to per-region custom shape drawers in
   *  illustrations.ts. Each region has a hand-authored silhouette
   *  (cookie-circle, open-book pages, mountain peaks, castle
   *  crenellations, etc.) drawn at depth 2. Approach detection + fog
   *  body still use the underlying tile rect; only the visual is
   *  custom. */
  private drawRegionTiles(): void {
    for (const region of this.sceneProps.regions) {
      const x = region.tile.x * TILE_SIZE_PX;
      const y = region.tile.y * TILE_SIZE_PX;
      const w = region.size.w * TILE_SIZE_PX;
      const h = region.size.h * TILE_SIZE_PX;
      const color = Phaser.Display.Color.HexStringToColor(region.themeColor).color;

      drawRegionShape(this, region, { x, y, w, h, themeColor: color, depth: 2 });
    }
  }

  /** Per-region iconic landmark compositions — Cakey statue on a
   *  pedestal in town-square, three towers with flags atop the
   *  castle, sailboat on the Sprinkle Shore sea, etc. Drawn at
   *  depth 3 so they sit cleanly above the region shape fill but
   *  below ribbon banners and buildings. */
  private drawRegionLandmarks(): void {
    for (const region of this.sceneProps.regions) {
      const x = region.tile.x * TILE_SIZE_PX;
      const y = region.tile.y * TILE_SIZE_PX;
      const w = region.size.w * TILE_SIZE_PX;
      const h = region.size.h * TILE_SIZE_PX;
      const color = Phaser.Display.Color.HexStringToColor(region.themeColor).color;

      drawRegionLandmark(this, region, { x, y, w, h, themeColor: color, depth: 3 });
    }
  }

  /** Region name in a Disney-style scroll ribbon at the bottom of
   *  each region. The ribbon color cycles per region (catalog field)
   *  so the labels read like Adventureland-green / Frontierland-orange
   *  / Fantasyland-pink rather than uniform-dark. */
  private drawRegionNameplates(): void {
    for (const region of this.sceneProps.regions) {
      const x = region.tile.x * TILE_SIZE_PX + (region.size.w * TILE_SIZE_PX) / 2;
      const y = region.tile.y * TILE_SIZE_PX + region.size.h * TILE_SIZE_PX - 16;

      drawRibbonBanner(this, {
        x, y,
        text: region.name,
        ribbonKey: region.ribbon,
        fontSize: 14,
        depth: 4,
      });
    }
  }

  // ---- Minimap ----

  /** Secondary camera pinned to the upper-right corner of the
   *  viewport, rendering the entire world at ~18.75% zoom. Both
   *  cameras render the same display list by default; we use
   *  ignore() to filter so the main view stays uncluttered (no
   *  redundant avatar dot) and the minimap stays legible (no
   *  building labels at sub-pixel size).
   *
   *  Pointer events are handled exclusively by the main camera;
   *  the input handler checks isInsideMinimap() and bails so a
   *  tap on the minimap doesn't walk the avatar to wherever the
   *  main camera is currently scrolled to under those screen
   *  pixels. */
  private setupMinimap(): void {
    const cam = this.cameras.add(
      WORLD_PX.w - MINIMAP_W_PX - MINIMAP_PAD_PX,
      MINIMAP_PAD_PX,
      MINIMAP_W_PX,
      MINIMAP_H_PX,
    );
    cam.setBounds(0, 0, WORLD_PX.w, WORLD_PX.h);
    cam.setZoom(MINIMAP_W_PX / WORLD_PX.w);
    cam.scrollX = 0;
    cam.scrollY = 0;
    cam.setBackgroundColor(0xffffff);
    // Tinted edge — Phaser camera has no border so we lean on the
    // background contrast instead. The white inset on a sky-blue
    // canvas reads as a separate UI element on its own.
    this.minimap = cam;

    // Avatar dot — only rendered on the minimap. Bright cherry
    // matches the brand and pops on a white inset.
    this.avatarDot = this.add.circle(
      this.avatar.container.x,
      this.avatar.container.y,
      MINIMAP_AVATAR_DOT_RADIUS_SCENE_PX,
      0xdc2626, // brand-cherry
    );

    // Each camera renders all GameObjects by default. Filter:
    //   - main camera ignores the avatar dot (we already show the
    //     emoji in main view)
    //   - minimap ignores the per-region/building decoration that
    //     would be sub-pixel and noisy at minimap scale
    this.cameras.main.ignore(this.avatarDot);

    cam.ignore(this.avatar.container);
    for (const fog of this.fogs.values()) {
      cam.ignore(fog.glyph);
      cam.ignore(fog.label);
    }
    for (const b of this.buildings) {
      cam.ignore(b.container);
    }
  }

  /** True if the given pointer lies within the minimap viewport's
   *  scene-space rect. Used to suppress walk-to-tap when the kid
   *  tapped the minimap inset. */
  private isInsideMinimap(pointer: Phaser.Input.Pointer): boolean {
    const cam = this.minimap;
    if (!cam) return false;
    return (
      pointer.x >= cam.x &&
      pointer.x <= cam.x + cam.width &&
      pointer.y >= cam.y &&
      pointer.y <= cam.y + cam.height
    );
  }

  // ---- Fog ----

  /** Render fog over every undiscovered, non-starter region. The
   *  fog rect is the same shape as before (static physics body
   *  blocks walking) but the visuals lean misty rather than ominous:
   *  slate-500 at lower alpha for a softer feel, with a ☁️ emoji and
   *  "???" label that read clearly at minimap scale. */
  private drawFog(): void {
    for (const region of this.sceneProps.regions) {
      if (region.starter) continue;
      if (this.discoveredSlugs.has(region.slug)) continue;

      const left = region.tile.x * TILE_SIZE_PX;
      const top = region.tile.y * TILE_SIZE_PX;
      const w = region.size.w * TILE_SIZE_PX;
      const h = region.size.h * TILE_SIZE_PX;
      const cx = left + w / 2;
      const cy = top + h / 2;

      const rect = this.add.rectangle(cx, cy, w, h, FOG_FILL_COLOR, FOG_FILL_ALPHA);
      rect.setStrokeStyle(2, 0x334155, 0.9); // slate-700 — softer than zinc-900
      rect.setDepth(6);

      // Static body — third arg `true` makes it immovable. Avatar
      // collides; fog rect doesn't move under collision impulse.
      this.physics.add.existing(rect, true);

      const glyph = this.add
        .text(cx, cy - 10, '☁️', {
          fontSize: `${FOG_GLYPH_FONT_PX}px`,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(6.1);

      const label = this.add
        .text(cx, cy + 28, '???', {
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: `${FOG_LABEL_FONT_PX}px`,
          fontStyle: 'bold',
          color: FOG_LABEL_COLOR,
          stroke: '#0f172a',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(6.1);

      this.fogs.set(region.slug, { rect, glyph, label });
    }
  }

  /** Animate a fog away on successful unlock. Fades both the rect
   *  and the glyph in a single tween, fires sparkle particles at the
   *  region center, plays the levelUp sfx, then destroys both
   *  display objects when the tween completes. */
  private removeFog(regionSlug: string): void {
    const fog = this.fogs.get(regionSlug);
    if (!fog) return;

    this.fogs.delete(regionSlug);

    // If the kid was approaching this region, clear that state so a
    // future re-approach (after walking out and back in) doesn't get
    // suppressed by the same-region throttle.
    if (this.currentApproachRegion === regionSlug) {
      this.currentApproachRegion = null;
    }

    const region = this.sceneProps.regions.find((r) => r.slug === regionSlug);
    if (region) {
      const cx = region.tile.x * TILE_SIZE_PX + (region.size.w * TILE_SIZE_PX) / 2;
      const cy = region.tile.y * TILE_SIZE_PX + (region.size.h * TILE_SIZE_PX) / 2;
      this.spawnSparkles(cx, cy);
    }

    this.hostBus.emit('scene:sfx', { name: 'levelUp' });

    this.tweens.add({
      targets: [fog.rect, fog.glyph, fog.label],
      alpha: 0,
      duration: FOG_FADE_DURATION_MS,
      onComplete: () => {
        fog.rect.destroy();
        fog.glyph.destroy();
        fog.label.destroy();
      },
    });
  }

  /** Burst of ✨ emojis radiating from the unlock center. Lightweight
   *  — 10 text objects that self-destruct after 800ms. Avoids a real
   *  particle system since we don't have an asset pipeline today. */
  private spawnSparkles(cx: number, cy: number): void {
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / SPARKLE_COUNT;
      const radius = 30 + Math.random() * 20;
      const tx = cx + Math.cos(angle) * radius;
      const ty = cy + Math.sin(angle) * radius;
      const sparkle = this.add
        .text(cx, cy, '✨', { fontSize: `${SPARKLE_FONT_PX}px` })
        .setOrigin(0.5, 0.5);

      this.tweens.add({
        targets: sparkle,
        x: tx,
        y: ty - 20,
        alpha: { from: 1, to: 0 },
        duration: SPARKLE_DURATION_MS,
        ease: 'Cubic.Out',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  /** Per-frame check: is the avatar close enough to a fogged-and-
   *  adjacent region to trigger an approach event? Throttled by
   *  currentApproachRegion so the modal only opens once per approach
   *  session — kid walks away and back, fires again. */
  private checkApproachFog(): void {
    const ax = this.avatar.container.x;
    const ay = this.avatar.container.y;

    let nearestSlug: string | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const region of this.sceneProps.regions) {
      if (region.starter) continue;
      if (this.discoveredSlugs.has(region.slug)) continue;
      // Adjacency gate — at least one neighbor must be discovered
      // before this region is unlock-eligible. Mirrors the rule in
      // /api/town/discover and lib/town/regions.ts isAdjacentToDiscovered.
      const adjacent = region.neighbors.some((n) =>
        this.discoveredSlugs.has(n),
      );
      if (!adjacent) continue;

      const left = region.tile.x * TILE_SIZE_PX;
      const top = region.tile.y * TILE_SIZE_PX;
      const right = left + region.size.w * TILE_SIZE_PX;
      const bottom = top + region.size.h * TILE_SIZE_PX;

      // Distance from avatar to nearest edge of region rect. Inside
      // the rect this is 0 (but the fog body prevents that case).
      const dx = Math.max(left - ax, 0, ax - right);
      const dy = Math.max(top - ay, 0, ay - bottom);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= FOG_APPROACH_DISTANCE_PX && dist < nearestDist) {
        nearestSlug = region.slug;
        nearestDist = dist;
      }
    }

    if (nearestSlug) {
      if (this.currentApproachRegion !== nearestSlug) {
        this.currentApproachRegion = nearestSlug;
        const region = this.sceneProps.regions.find(
          (r) => r.slug === nearestSlug,
        );
        if (region) {
          this.hostBus.emit('town:approach-fog', {
            regionSlug: region.slug,
            cost: region.unlock_cost,
          });
        }
      }
    } else {
      this.currentApproachRegion = null;
    }
  }

  // ---- Buildings ----

  /** One building per game in each region's games[]. Buildings spread
   *  evenly across the region's horizontal width using the formula
   *  (i + 1) / (count + 1), so:
   *    - 1 game  → centered at 50%
   *    - 2 games → at 33% and 67%
   *    - 3 games → at 25%, 50%, 75%
   *  Fits inside any 4-tile-wide region with the current 80 px
   *  building width.
   *
   *  Buildings are added to `this.buildings` so the arrival check in
   *  update() can resolve a pending game slug. They're also drawn
   *  before the avatar in create() so the avatar renders on top
   *  when the kid walks onto a building. */
  private drawBuildings(): void {
    for (const region of this.sceneProps.regions) {
      if (region.games.length === 0) continue;

      const regionPxX = region.tile.x * TILE_SIZE_PX;
      const regionPxY = region.tile.y * TILE_SIZE_PX;
      const regionPxW = region.size.w * TILE_SIZE_PX;
      const regionPxH = region.size.h * TILE_SIZE_PX;

      region.games.forEach((gameSlug, i) => {
        const game = findGame(gameSlug);
        if (!game) return; // Build-time invariant in regions.ts already warns.

        const cx = regionPxX + (regionPxW * (i + 1)) / (region.games.length + 1);
        const cy = regionPxY + regionPxH * BUILDING_VERTICAL_PCT;

        this.buildings.push(
          this.createBuilding({
            cx,
            cy,
            gameSlug: game.slug,
            label: game.label,
            glyph: game.glyph,
            tintHex: region.themeColor,
          }),
        );
      });
    }
  }

  /** Build the visual + interactive bundle for one building. Replaces
   *  the original flat rounded-rect with a peaked-roof "house" shape:
   *  a triangle roof in the region's themeColor crowning a white
   *  rectangular body. Reads as a tiny landmark on the map rather
   *  than a generic UI card — closer to the Disneyland-map "rides
   *  marked as buildings" idiom. The label sits below the body in
   *  a pill so it doesn't fight the emoji "sign" inside the body. */
  private createBuilding(opts: {
    cx: number;
    cy: number;
    gameSlug: string;
    label: string;
    glyph: string;
    tintHex: string;
  }): BuildingHandle {
    const container = this.add.container(opts.cx, opts.cy).setDepth(5);
    const tint = Phaser.Display.Color.HexStringToColor(opts.tintHex).color;

    // Building proportions — total visual height = ROOF_H + BODY_H,
    // total tap area extends below for the label pill.
    const ROOF_H = 22;
    const BODY_H = 58;
    const TOTAL_H = ROOF_H + BODY_H;
    const TOP = -TOTAL_H / 2;
    const ROOF_BASE_Y = TOP + ROOF_H;

    const card = this.add.graphics();

    // Body (white, rounded only at the bottom — top is flush with the
    // roof base). fillRoundedRect with a number radius rounds all four
    // corners; we draw a regular rect for the body and let the roof
    // cover the top corners visually.
    card.fillStyle(0xffffff, 0.96);
    card.fillRoundedRect(
      -BUILDING_W_PX / 2,
      ROOF_BASE_Y,
      BUILDING_W_PX,
      BODY_H,
      { tl: 0, tr: 0, bl: 8, br: 8 },
    );
    card.lineStyle(2, 0x111827, 0.7);
    card.strokeRoundedRect(
      -BUILDING_W_PX / 2,
      ROOF_BASE_Y,
      BUILDING_W_PX,
      BODY_H,
      { tl: 0, tr: 0, bl: 8, br: 8 },
    );

    // Roof — a triangle slightly wider than the body for an overhang
    // that reads at minimap zoom. Filled in the region themeColor so
    // each region's buildings inherit the local palette automatically.
    card.fillStyle(tint, 1);
    card.beginPath();
    card.moveTo(-BUILDING_W_PX / 2 - 4, ROOF_BASE_Y);
    card.lineTo(0, TOP);
    card.lineTo(BUILDING_W_PX / 2 + 4, ROOF_BASE_Y);
    card.closePath();
    card.fillPath();
    card.lineStyle(2, 0x111827, 0.8);
    card.strokePath();

    // Roof spine — a darker line along the bottom edge of the roof
    // so the triangle reads as a structure rather than a flat tab.
    card.lineStyle(1.5, 0x111827, 0.5);
    card.lineBetween(
      -BUILDING_W_PX / 2 - 4,
      ROOF_BASE_Y,
      BUILDING_W_PX / 2 + 4,
      ROOF_BASE_Y,
    );

    // Game emoji centered in the body — the building's "sign."
    const glyph = this.add
      .text(0, ROOF_BASE_Y + BODY_H / 2 - 6, opts.glyph, {
        fontSize: `${BUILDING_GLYPH_FONT_PX}px`,
      })
      .setOrigin(0.5, 0.5);

    // Label pill below the body — tiny dark-on-white tag that reads
    // even at minimap scale. Drawn AFTER text so we can size the pill
    // background to the rendered text width.
    const labelY = TOTAL_H / 2 + 14;
    const label = this.add
      .text(0, labelY, opts.label, {
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: `${BUILDING_LABEL_FONT_PX}px`,
        fontStyle: 'bold',
        color: '#1f2937',
        align: 'center',
      })
      .setOrigin(0.5, 0.5);
    const labelPill = this.add
      .rectangle(0, labelY, label.width + 12, label.height + 4, 0xffffff, 0.92)
      .setStrokeStyle(1, 0x1f2937, 0.5);

    // Z-order inside the container: card (roof + body) → emoji →
    // label pill → label text. setDepth on container alone isn't
    // enough; container children are drawn in add() order.
    container.add([card, glyph, labelPill, label]);

    // Hit area covers the whole structure including the label pill.
    const hitH = TOTAL_H + 32;
    container.setSize(BUILDING_W_PX, hitH);
    container.setInteractive(
      new Phaser.Geom.Rectangle(
        -BUILDING_W_PX / 2,
        TOP,
        BUILDING_W_PX,
        hitH,
      ),
      Phaser.Geom.Rectangle.Contains,
    );

    const handle: BuildingHandle = {
      container,
      gameSlug: opts.gameSlug,
      worldX: opts.cx,
      worldY: opts.cy,
    };

    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        // Stop propagation so the scene-level pointerdown doesn't
        // also fire and clear pendingGameSlug. Without this, any
        // building tap would walk the avatar to the building but
        // forget the kid wanted to enter on arrival.
        event.stopPropagation();
        this.pendingGameSlug = handle.gameSlug;
        this.moveTarget = { x: handle.worldX, y: handle.worldY };
        this.hostBus.emit('scene:sfx', { name: 'tap' });
      },
    );

    // Disney-style numbered ride chip — small colored disk beside the
    // building's upper-left, with a sequential 1-10 number from
    // RIDE_NUMBERS. Chip color matches the region's tint so the
    // numbering reads as part of the land. Drawn at world coords
    // (NOT inside the container) so the building's tap area still
    // works cleanly without the chip stealing taps.
    const chipNumber = RIDE_NUMBERS[opts.gameSlug];
    if (chipNumber) {
      drawNumberChip(
        this,
        opts.cx - BUILDING_W_PX / 2 - 4,
        opts.cy - 36,
        chipNumber,
        tint,
        5.5,
      );
    }

    return handle;
  }

  // ---- Avatar ----

  private createAvatar(x: number, y: number): AvatarBundle {
    const container = this.add.container(x, y);

    const ring = this.add.graphics();
    ring.fillStyle(0xffffff, 1);
    ring.fillCircle(0, 0, AVATAR_RADIUS_PX);
    ring.lineStyle(3, 0x111827, 1); // zinc-900
    ring.strokeCircle(0, 0, AVATAR_RADIUS_PX);

    const emoji = this.add
      .text(0, 0, this.sceneProps.avatar, {
        fontSize: `${AVATAR_FONT_SIZE_PX}px`,
      })
      .setOrigin(0.5, 0.5);

    container.add([ring, emoji]);
    container.setSize(AVATAR_RADIUS_PX * 2, AVATAR_RADIUS_PX * 2);

    this.physics.world.enable(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    body.setCircle(AVATAR_RADIUS_PX, -AVATAR_RADIUS_PX, -AVATAR_RADIUS_PX);
    body.setCollideWorldBounds(true);

    return { container, body };
  }

  // ---- Input ----

  private onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // Suppress walk-to-tap if the kid tapped the minimap inset —
    // otherwise the world-coord translation under the inset's
    // screen pixels would walk the avatar to wherever the main
    // camera happens to be showing there. Building handlers
    // already stopPropagation so they never reach this branch.
    if (this.isInsideMinimap(pointer)) {
      return;
    }
    // Convert screen coordinates to world coordinates so the avatar
    // walks toward the spot the kid actually tapped, not the screen
    // pixel under the camera. Phaser's getWorldPoint() handles the
    // FIT-mode scale + camera scroll for us.
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.moveTarget = { x: world.x, y: world.y };
    // Tapping the open map cancels any pending building entry — kid
    // changed their mind. Building handlers stopPropagation so they
    // never reach this scene-level handler.
    this.pendingGameSlug = null;
    this.hostBus.emit('scene:sfx', { name: 'tap' });
  };

  // ---- Frame loop ----

  update(): void {
    if (this.moveTarget) {
      const dx = this.moveTarget.x - this.avatar.container.x;
      const dy = this.moveTarget.y - this.avatar.container.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= ARRIVE_DISTANCE_PX * ARRIVE_DISTANCE_PX) {
        this.avatar.body.setVelocity(0, 0);
        this.moveTarget = null;
        // If the move target was a building, fire the entry now.
        // We emit position FIRST (so the kid respawns where they
        // entered when they come back) THEN town:enter-game which
        // the host translates to a router.push to /games/{slug}.
        // The position POST has keepalive: true so it survives the
        // navigation that happens microseconds later.
        if (this.pendingGameSlug) {
          const slug = this.pendingGameSlug;
          this.pendingGameSlug = null;
          this.maybeEmitPosition();
          this.hostBus.emit('town:enter-game', { gameSlug: slug });
        }
      } else {
        const dist = Math.sqrt(distSq);
        this.avatar.body.setVelocity(
          (dx / dist) * WALK_SPEED_PX_PER_SEC,
          (dy / dist) * WALK_SPEED_PX_PER_SEC,
        );
      }
    } else if (this.avatar.body.velocity.x !== 0 || this.avatar.body.velocity.y !== 0) {
      // Defensive: if the body has residual velocity (e.g. world bounds
      // collision interrupted the walk) but no target, zero it so the
      // avatar doesn't drift.
      this.avatar.body.setVelocity(0, 0);
    }

    this.updateCurrentRegion();
    this.checkApproachFog();

    // Sync minimap dot to avatar position. Cheaper than a follow
    // configuration (which would also set zoom) — single assignment
    // per frame and the dot is drawn in scene coords.
    if (this.avatarDot) {
      this.avatarDot.x = this.avatar.container.x;
      this.avatarDot.y = this.avatar.container.y;
    }
  }

  /** Track which region the avatar is currently in. Linear scan over
   *  8 regions per frame is trivial — keeping it simple beats a
   *  spatial index until we actually have hundreds of regions. */
  private updateCurrentRegion(): void {
    const ax = this.avatar.container.x;
    const ay = this.avatar.container.y;
    for (const region of this.sceneProps.regions) {
      const left = region.tile.x * TILE_SIZE_PX;
      const top = region.tile.y * TILE_SIZE_PX;
      const right = left + region.size.w * TILE_SIZE_PX;
      const bottom = top + region.size.h * TILE_SIZE_PX;
      if (ax >= left && ax <= right && ay >= top && ay <= bottom) {
        this.currentRegionSlug = region.slug;
        return;
      }
    }
    // Avatar between regions — keep the last known. The position-update
    // payload should still reflect *somewhere* meaningful, and
    // currentRegionSlug holds the most recent containing region.
  }

  // ---- Position sync ----

  private maybeEmitPosition(): void {
    const x = Math.round(this.avatar.container.x);
    const y = Math.round(this.avatar.container.y);
    if (x === this.lastEmittedX && y === this.lastEmittedY) return;
    this.lastEmittedX = x;
    this.lastEmittedY = y;
    this.hostBus.emit('town:position-update', {
      region_slug: this.currentRegionSlug,
      x,
      y,
    });
  }
}
