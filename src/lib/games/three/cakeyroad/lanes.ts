// Cakey Road — procedural lane-plan generator.
//
// PURE data, no `three`: given a row index, decide what kind of lane it is and
// its hazard/raft/coin parameters. The engine turns these specs into meshes +
// motion. Keeping it pure means the "every run is solvable" invariants are
// unit-testable without a WebGL context (see the M5 passability harness).
//
// Solvability by construction:
//   • The first SAFE_START_ROWS are grass (a safe launch pad).
//   • River bands never exceed tuning.maxRiverBand consecutive rows, and each
//     river row is individually crossable (rafts keep drifting past, so a raft
//     is always reachable within a bounded wait).
//   • A checkpoint gate lane is forced every tuning.gateEvery rows; gate lanes
//     are safe grass, so the kid is never asked to solve math mid-river.
//   • Trees are cosmetic edge decor only (non-blocking), so no grass row can
//     ever wall the player in.

import type { CakeyRoadTuning } from './types';

export type LaneType = 'grass' | 'road' | 'river' | 'rail' | 'gate';

/** Playable columns (x cells). Player starts centered; hazards travel across x
 *  and wrap. Wider than tall-on-screen so sideways dodging always has room. */
export const COLS = 9;
export const CENTER_COL = (COLS - 1) / 2; // 4
export const SAFE_START_ROWS = 4;
/** After the safe pad, ease the player in over this many rows: extra grass and
 *  slower hazards that ramp up to full pace. Keeps the crossing from opening at
 *  full difficulty (kid feedback: "starts way too hard even on easy"). */
export const RAMP_ROWS = 8;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export type HazardKind = 'peppermint' | 'licorice' | 'trolley';

export interface LaneSpec {
  row: number;
  type: LaneType;
  band: 'lit' | 'mid';       // alternating bed shade (readability banding)
  dir: 1 | -1;               // hazard / raft travel direction across x
  speed: number;             // cells/s
  gap: number;               // spacing between hazards / rafts (cells)
  phase: number;             // 0..1 initial offset so lanes don't sync
  raftLen: number;           // river only — raft length in cells
  hazardKind: HazardKind;    // road only
  hasCoin: boolean;
  coinCol: number;           // column of the coin, if hasCoin
  trainWarnMs: number;       // rail only — crossing-signal lead time
}

export interface Rng {
  (): number; // returns [0,1)
}

/** Stateful generator: call `next(row)` with strictly increasing row indices
 *  (0,1,2,…). Remembers the recent river run so it can cap band length. */
export function createLaneGenerator(tuning: CakeyRoadTuning, rng: Rng = Math.random) {
  let riverRun = 0;
  let lastType: LaneType | null = null;

  const pickHazardKind = (): HazardKind => {
    const r = rng();
    if (r < 0.5) return 'peppermint';
    if (r < 0.8) return 'licorice';
    return 'trolley';
  };

  const maybeCoin = (type: LaneType): { hasCoin: boolean; coinCol: number } => {
    // Coins ride safe lanes (grass) or the road shoulders; never on gate rows.
    if (type === 'gate') return { hasCoin: false, coinCol: 0 };
    const hasCoin = rng() < tuning.coinChance;
    return { hasCoin, coinCol: Math.floor(rng() * COLS) };
  };

  const base = (row: number, type: LaneType): LaneSpec => {
    const coin = maybeCoin(type);
    return {
      row,
      type,
      band: row % 2 === 0 ? 'lit' : 'mid',
      dir: rng() < 0.5 ? 1 : -1,
      speed: tuning.carSpeed,
      gap: tuning.carGap,
      phase: rng(),
      raftLen: tuning.raftLen,
      hazardKind: pickHazardKind(),
      hasCoin: coin.hasCoin,
      coinCol: coin.coinCol,
      trainWarnMs: tuning.trainWarnMs,
    };
  };

  return {
    next(row: number): LaneSpec {
      // Safe launch pad.
      if (row < SAFE_START_ROWS) {
        riverRun = 0;
        lastType = 'grass';
        return base(row, 'grass');
      }
      // Forced checkpoint gate.
      if (row % tuning.gateEvery === 0) {
        riverRun = 0;
        lastType = 'gate';
        return base(row, 'gate');
      }

      // On-ramp: for the first RAMP_ROWS after the safe pad, bias toward grass
      // and slow the hazards, ramping both up to full over the ramp so the
      // opening is always gentle regardless of the picked difficulty.
      const rampT = clamp01((row - SAFE_START_ROWS) / RAMP_ROWS); // 0 → 1 across the ramp
      const speedRamp = 0.55 + 0.45 * rampT; // hazards move at 55% → 100% pace early on
      const grassBoost = (1 - rampT) * 0.5;  // extra safe rows up front

      // Weighted pick among the hazard/safe lanes, respecting constraints.
      const canRiver = riverRun < tuning.maxRiverBand;
      const canRail = lastType !== 'rail'; // no back-to-back trains

      // weights: grass, road, river, rail
      const wGrass = 0.26 + grassBoost;
      const wRoad = 0.42;
      const wRiver = canRiver ? 0.22 : 0;
      const wRail = canRail ? 0.1 : 0;
      const total = wGrass + wRoad + wRiver + wRail;
      let r = rng() * total;

      let type: LaneType;
      if ((r -= wGrass) < 0) type = 'grass';
      else if ((r -= wRoad) < 0) type = 'road';
      else if ((r -= wRiver) < 0) type = 'river';
      else type = 'rail';

      if (type === 'river') riverRun += 1;
      else riverRun = 0;

      const spec = base(row, type);
      if (type === 'river') { spec.speed = tuning.raftSpeed; spec.gap = tuning.raftGap; }
      else if (type === 'rail') { spec.speed = tuning.trainSpeed; spec.gap = 999; } // one train at a time
      // Ease hazard pace during the on-ramp (grass has no speed to scale).
      if (type === 'road' || type === 'river' || type === 'rail') spec.speed *= speedRamp;
      lastType = type;
      return spec;
    },
  };
}
