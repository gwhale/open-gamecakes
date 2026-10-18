// Generator property tests for Waffle Sudoku — the acceptance test for the
// ladder's dials.
//
// Every tier, twenty seeds, alternating the band's generous end and its
// sparse end. Each puzzle must be the band's size, inside its givens range,
// uniquely solvable within its technique, and produced fast enough that
// "Cakey is baking your waffle…" is a beat, not a wait. A band that cannot
// hit its range stalls THIS loop, and the fix is to widen the range in
// ladder.ts (and say so there) — never to loosen the assertions here.

import { describe, expect, it } from 'vitest';
import { MIN_EVIDENCE_ANSWERS } from '@/lib/mastery/update';
import { generateForSpec, generatePuzzle } from './generate';
import { LADDER, specForScore, startScoreForTier, type PuzzleSpec } from './ladder';
import { countSolutions } from './solver';
import { SPECS, TECHNIQUE_RANK, isValidSolution, tablesFor } from './types';

const SEEDS_PER_TIER = 20;

function ceilingScore(tier: number): number {
  return tier * 10 - 1;
}

function specsForTier(tier: number): { floor: PuzzleSpec; ceiling: PuzzleSpec } {
  return { floor: specForScore(startScoreForTier(tier)), ceiling: specForScore(ceilingScore(tier)) };
}

function isSymmetric(cells: Uint8Array): boolean {
  const n = cells.length;
  for (let i = 0; i < n; i++) if ((cells[i] !== 0) !== (cells[n - 1 - i] !== 0)) return false;
  return true;
}

describe('generateForSpec over the whole ladder', () => {
  const timings: number[] = [];

  for (const band of LADDER) {
    it(`tier ${band.tier}: ${band.size}×${band.size} ${band.maxTechnique} ${band.givens.min}–${band.givens.max} givens`, () => {
      const { floor, ceiling } = specsForTier(band.tier);
      const gs = SPECS[band.size];
      for (let seed = 0; seed < SEEDS_PER_TIER; seed++) {
        const spec = seed % 2 === 0 ? floor : ceiling;
        const t0 = performance.now();
        const p = generateForSpec(spec, seed * 7919 + band.tier);
        timings.push(performance.now() - t0);

        expect(p.size, `seed ${seed} size`).toBe(band.size);
        expect(p.givensCount, `seed ${seed} givens`).toBeGreaterThanOrEqual(band.givens.min);
        expect(p.givensCount, `seed ${seed} givens`).toBeLessThanOrEqual(band.givens.max);
        expect(p.blanks).toBe(band.size * band.size - p.givensCount);
        expect(p.blanks, `seed ${seed} evidence`).toBeGreaterThanOrEqual(MIN_EVIDENCE_ANSWERS);
        expect(isValidSolution(gs, p.solution), `seed ${seed} solution`).toBe(true);
        for (let i = 0; i < p.givens.length; i++) {
          if (p.givens[i] !== 0) expect(p.givens[i], `seed ${seed} given ${i}`).toBe(p.solution[i]);
        }
        expect(countSolutions(gs, p.givens, 2), `seed ${seed} unique`).toBe(1);
        expect(TECHNIQUE_RANK[p.technique], `seed ${seed} technique ${p.technique}`).toBeLessThanOrEqual(
          TECHNIQUE_RANK[band.maxTechnique],
        );
        if (band.symmetric) expect(isSymmetric(p.givens), `seed ${seed} symmetric`).toBe(true);
      }
    });
  }

  it('stays inside the timing budget (p90 < 150 ms, max < 500 ms)', () => {
    expect(timings.length).toBe(LADDER.length * SEEDS_PER_TIER);
    const sorted = [...timings].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const max = sorted[sorted.length - 1];
    console.info(`[sudoku generate] p50 ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms · p90 ${p90.toFixed(1)} ms · max ${max.toFixed(1)} ms`);
    expect(p90).toBeLessThan(150);
    expect(max).toBeLessThan(500);
  });
});

describe('generateForSpec, properties', () => {
  it('is deterministic in (spec, seed)', () => {
    const spec = specForScore(startScoreForTier(8));
    const a = generateForSpec(spec, 12345);
    const b = generateForSpec(spec, 12345);
    expect(Array.from(a.givens)).toEqual(Array.from(b.givens));
    expect(Array.from(a.solution)).toEqual(Array.from(b.solution));
    expect(a.seed).toBe(12345);
  });

  it('gives at least 4 distinct grids across 5 seeds at tier 6', () => {
    const spec = specForScore(startScoreForTier(6));
    const keys = new Set<string>();
    for (let seed = 0; seed < 5; seed++) keys.add(Array.from(generateForSpec(spec, seed).givens).join(''));
    expect(keys.size).toBeGreaterThanOrEqual(4);
  });

  it('tier-1 blanks always span at least 2 rows and 2 columns', () => {
    const spec = specForScore(startScoreForTier(1));
    const { rowOf, colOf } = tablesFor(SPECS[4]);
    for (let seed = 0; seed < 40; seed++) {
      const p = generateForSpec(spec, seed);
      const rows = new Set<number>();
      const cols = new Set<number>();
      for (let i = 0; i < 16; i++) {
        if (p.givens[i] === 0) {
          rows.add(rowOf[i]);
          cols.add(colOf[i]);
        }
      }
      expect(rows.size, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(cols.size, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('never returns an invalid technique', () => {
    for (let seed = 0; seed < 10; seed++) {
      const p = generatePuzzle(
        { size: 9, givens: { min: 24, max: 30, target: 26 }, maxTechnique: 'advanced', symmetric: false },
        seed,
      );
      expect(['singles', 'hidden', 'advanced']).toContain(p.technique);
    }
  });
});
