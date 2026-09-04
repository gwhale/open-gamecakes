import { describe, expect, it } from 'vitest';
import {
  generateConceptChallenge,
  isConceptType,
  CONCEPT_TYPES,
  type ConceptType,
} from './generate-concept-challenge';

const DRAWS = 300;
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function draw(type: ConceptType, tier: number) {
  return Array.from({ length: DRAWS }, () => generateConceptChallenge(type, tier));
}

describe('generateConceptChallenge', () => {
  // ChoiceChallenge's contract, which the host modal relies on: the answer has
  // to be one of the buttons, and there have to be between two and four of
  // them. A duplicated choice reads to a kid as two right answers.
  it('always produces a renderable choice challenge', () => {
    for (const type of CONCEPT_TYPES) {
      for (const tier of TIERS) {
        for (const c of draw(type, tier)) {
          const where = `${type} @ ${tier}: ${c.prompt} -> ${c.choices.join(' | ')}`;
          expect(c.kind).toBe('choice');
          expect(c.prompt.length, where).toBeGreaterThan(0);
          expect(c.choices, where).toContain(c.answer);
          expect(c.choices.length, where).toBeGreaterThanOrEqual(2);
          expect(c.choices.length, where).toBeLessThanOrEqual(4);
          expect(new Set(c.choices).size, `duplicate choice — ${where}`).toBe(
            c.choices.length,
          );
        }
      }
    }
  });

  // If the answer always landed in the same slot a kid would find that long
  // before they found the maths.
  it('does not park the answer in a fixed slot', () => {
    const positions = new Set(
      draw('compare', 5).map((c) => c.choices.indexOf(c.answer)),
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  describe('compare — K.CC.C.6/7, 1.NBT.B.3, 2.NBT.A.4', () => {
    it('asks in words at K level and with symbols once 1.NBT.B.3 names them', () => {
      expect(draw('compare', 1).every((c) => c.prompt.startsWith('Which is more'))).toBe(true);
      const symbols = draw('compare', 4);
      expect(symbols.every((c) => ['>', '<', '='].includes(c.answer))).toBe(true);
    });

    it('includes equal pairs — K.CC.C.6 says "greater, less, or equal"', () => {
      expect(draw('compare', 5).some((c) => c.answer === '=')).toBe(true);
    });

    it('reaches three-digit comparison for 2.NBT.A.4', () => {
      const numbers = draw('compare', 6)
        .flatMap((c) => c.prompt.match(/\d+/g) ?? [])
        .map(Number);
      expect(Math.max(...numbers)).toBeGreaterThan(99);
    });
  });

  describe('place-value — 1.NBT.B.2, 2.NBT.A.1', () => {
    it('stays on tens and ones below tier 4, and reaches hundreds at 4', () => {
      expect(draw('place-value', 2).some((c) => /hundreds/.test(c.prompt))).toBe(false);
      expect(draw('place-value', 5).some((c) => /hundreds/.test(c.prompt))).toBe(true);
    });
  });

  describe('skip-count — 2.NBT.A.2 (CA) and 2.OA.C.3', () => {
    // California's addition to 2.NBT.A.2 is counting by 2s specifically; the
    // catalog description drops it, so the generator is where it has to hold.
    it('counts by 2s, 5s and 10s', () => {
      const steps = new Set(
        draw('skip-count', 3)
          .map((c) => c.subtext?.match(/by (\d+)s/)?.[1])
          .filter(Boolean),
      );
      expect(steps).toEqual(new Set(['2', '5', '10']));
    });

    it('asks odd or even — 2.OA.C.3', () => {
      const oddEven = draw('skip-count', 3).filter((c) => /odd or even/.test(c.prompt));
      expect(oddEven.length).toBeGreaterThan(0);
      for (const c of oddEven) {
        const n = Number(c.prompt.match(/\d+/)![0]);
        expect(c.answer).toBe(n % 2 === 0 ? 'Even' : 'Odd');
      }
    });
  });

  describe('shapes — K.G, 1.G, 2.G', () => {
    it('names shapes by their number of sides, both directions', () => {
      const prompts = draw('shapes', 2).map((c) => c.prompt);
      expect(prompts.some((p) => /How many sides/.test(p))).toBe(true);
      expect(prompts.some((p) => /Which shape has/.test(p))).toBe(true);
    });

    it('separates flat from solid once solids arrive — K.G.A.3, 1.G.A.2', () => {
      expect(draw('shapes', 6).some((c) => /flat or solid/.test(c.prompt))).toBe(true);
    });
  });

  describe('time-money — 1.MD.B.3, 2.MD.C.7 (CA), 2.MD.C.8', () => {
    it('covers clock reading, time relationships and coins', () => {
      const prompts = draw('time-money', 4).map((c) => c.prompt);
      expect(prompts.some((p) => /little hand/.test(p))).toBe(true);
      expect(prompts.some((p) => /How many (minutes|hours|days|months|weeks)/.test(p))).toBe(true);
      expect(prompts.some((p) => /How many cents/.test(p))).toBe(true);
    });

    it('adds coin values correctly', () => {
      const CENTS: Record<string, number> = {
        penny: 1, pennies: 1, nickel: 5, nickels: 5,
        dime: 10, dimes: 10, quarter: 25, quarters: 25,
      };
      for (const c of draw('time-money', 5)) {
        const m = c.prompt.match(/^(\d+) (\w+) and (\d+) (\w+)\./);
        if (!m) continue;
        const total = Number(m[1]) * CENTS[m[2]] + Number(m[3]) * CENTS[m[4]];
        expect(c.answer, c.prompt).toBe(`${total}¢`);
      }
    });
  });


  describe('fractions — 1.G.A.3, 2.G.A.3, 3.NF.A.1, 3.NF.A.3', () => {
    it('always draws something, and never draws an impossible shape', () => {
      for (const tier of TIERS) {
        for (const c of draw('fractions', tier)) {
          expect(c.figures?.length, c.prompt).toBeGreaterThan(0);
          for (const f of c.figures!) {
            expect(f.total).toBeGreaterThan(0);
            expect(f.shaded).toBeGreaterThanOrEqual(0);
            expect(f.shaded, `${f.shaded}/${f.total}`).toBeLessThanOrEqual(f.total);
          }
        }
      }
    });

    // Grades 1-2 partition and NAME shares; fraction notation is grade 3.
    it('uses no fraction notation below grade 3', () => {
      for (const c of draw('fractions', 2)) {
        expect(c.answer, c.prompt).not.toMatch(/\d+\/\d+/);
      }
      expect(draw('fractions', 2).some((c) => /halves|thirds|fourths/.test(c.answer))).toBe(true);
    });

    it('names the shaded amount as a/b at grade 3', () => {
      expect(draw('fractions', 5).some((c) => /^\d+\/\d+$/.test(c.answer))).toBe(true);
    });

    // 3.NF.A.3 is explicit that a comparison is only valid when both fractions
    // refer to the same whole — so a two-figure question must never mix them.
    it('compares two wholes that are actually the same whole', () => {
      const pairs = draw('fractions', 9).filter((c) => (c.figures?.length ?? 0) === 2);
      expect(pairs.length).toBeGreaterThan(0);
      for (const c of pairs) {
        const [a, b] = c.figures!;
        expect(a.total, c.prompt).toBe(b.total);
        expect(a.shape).toBe(b.shape);
        // and the named winner is genuinely the bigger one
        const bigger = a.shaded > b.shaded ? 'A' : 'B';
        expect(c.answer).toBe(bigger);
      }
    });
  });

  describe('area — 2.G.A.2, 2.OA.C.4, 3.MD.C.5/C.7', () => {
    it('draws a real grid and counts it correctly', () => {
      for (const c of draw('area', 5)) {
        const f = c.figures![0];
        expect(f.shape).toBe('grid');
        const squares = f.total * (f.rows ?? 1);
        expect(f.shaded).toBe(squares);
        expect(c.answer.replace(' squares', '')).toBe(String(squares));
      }
    });
  });

  it('recognises its own type names and rejects arithmetic ones', () => {
    for (const t of CONCEPT_TYPES) expect(isConceptType(t)).toBe(true);
    for (const t of ['addition', 'division', 'mixed', 'synonyms']) {
      expect(isConceptType(t)).toBe(false);
    }
  });
});
