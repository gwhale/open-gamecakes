// Cakey's Maze — maze data + grid utilities.
//
// Pure data + helpers, no Phaser. Lives in src/lib/games so the page
// (a client component) can read maze geometry to size the canvas
// without dragging Phaser into the server bundle.
//
// Layout choice: 13 cols × 15 rows, with horizontal symmetry and a
// central ghost pen. Smaller than classic Pac-Man (28×31) so it fits
// portrait iPad without the kid getting lost. Two side tunnels
// connect the left and right edges — when Cakey runs through one
// she warps to the matching tile on the other side, classic Pac-Man
// style. That's a deliberately cool "I escaped" moment for kids.
//
// Tile semantics:
//   #  wall
//   .  pellet (1 point)
//   o  power pellet (5 points + ghost-vulnerable mode)
//   _  empty (corridor with no pellet — used in tunnel + ghost pen)
//   S  Cakey spawn (also empty — no pellet under her start)
//   G  ghost spawn (empty — three positions used in order)

export type Tile = '#' | '.' | 'o' | '_' | 'S' | 'G';

/** Maze ASCII. Each char is one cell. Width must equal MAZE_COLS. */
const MAZE_ASCII = [
  '#############',
  '#o.........o#',
  '#.##.###.##.#',
  '#...........#',
  '#.##.#.#.##.#',
  '#....#G#....#',
  '####.###.####',
  '____.#G#.____',
  '####.###.####',
  '#....#G#....#',
  '#.##.#.#.##.#',
  '#...........#',
  '#.##.###.##.#',
  '#o....S....o#',
  '#############',
] as const;

export const MAZE_COLS = 13;
export const MAZE_ROWS = 15;

/** Cell pixel size at 1× scale. The scene scales itself to fit the
 *  viewport but starts from this baseline so Cakey looks chunky on
 *  iPad and not tiny on a 4K monitor. */
export const CELL_PX = 36;

/** Header band at the top for HUD (score / lives / pellets) — counted
 *  outside the maze rows in the canvas height. */
export const HEADER_PX = 64;

export interface MazeCell {
  tile: Tile;
  /** Whether walking through is allowed. False for walls; true for
   *  the tunnel-edge cells (rows 7 cols 0 and 12) so wraparound works. */
  walkable: boolean;
  /** Whether a pellet was originally here. Eaten pellets clear in the
   *  scene's runtime state; this static flag stays true. */
  hadPellet: boolean;
  /** Power pellet flag. Eaten power pellets clear in runtime. */
  hadPower: boolean;
}

export interface MazeData {
  cells: MazeCell[][];
  cakeySpawn: { col: number; row: number };
  ghostSpawns: Array<{ col: number; row: number }>;
  pelletCount: number;
  powerPelletCount: number;
}

/** Parse the ASCII into a typed grid. Done once at module load —
 *  the result is frozen and shared across scene re-creations. */
function parseMaze(): MazeData {
  const cells: MazeCell[][] = [];
  let cakeySpawn: { col: number; row: number } | null = null;
  const ghostSpawns: Array<{ col: number; row: number }> = [];
  let pelletCount = 0;
  let powerPelletCount = 0;

  for (let r = 0; r < MAZE_ROWS; r += 1) {
    const row: MazeCell[] = [];
    const line = MAZE_ASCII[r];
    if (line.length !== MAZE_COLS) {
      throw new Error(
        `[Cakey's Maze] row ${r} has ${line.length} cells, expected ${MAZE_COLS}`,
      );
    }
    for (let c = 0; c < MAZE_COLS; c += 1) {
      const ch = line[c] as Tile;
      const cell: MazeCell = {
        tile: ch,
        walkable: ch !== '#',
        hadPellet: ch === '.',
        hadPower: ch === 'o',
      };
      if (ch === '.') pelletCount += 1;
      if (ch === 'o') powerPelletCount += 1;
      if (ch === 'S') cakeySpawn = { col: c, row: r };
      if (ch === 'G') ghostSpawns.push({ col: c, row: r });
      row.push(cell);
    }
    cells.push(row);
  }

  if (!cakeySpawn) throw new Error("[Cakey's Maze] no S (Cakey spawn) cell");
  if (ghostSpawns.length === 0) throw new Error("[Cakey's Maze] no G (ghost spawn) cells");

  return { cells, cakeySpawn, ghostSpawns, pelletCount, powerPelletCount };
}

const MAZE = parseMaze();
export { MAZE };

/** Tunnel wrap: rows where col=0 and col=cols-1 are both walkable
 *  edges, and stepping off one warps to the other. Computed once
 *  from the parsed maze so the scene doesn't have to special-case. */
export const TUNNEL_ROWS: ReadonlyArray<number> = (() => {
  const rows: number[] = [];
  for (let r = 0; r < MAZE_ROWS; r += 1) {
    if (MAZE.cells[r][0].walkable && MAZE.cells[r][MAZE_COLS - 1].walkable) {
      rows.push(r);
    }
  }
  return rows;
})();
