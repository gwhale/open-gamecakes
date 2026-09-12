import { describe, expect, it } from 'vitest';
import {
  generateConceptChallenge,
  isConceptType,
  CONCEPT_TYPES,
  type ConceptChallenge,
  type ConceptType,
} from './generate-concept-challenge';
import type { Challenge, ChoiceChallenge, StepsChallenge } from './challenge';

const DRAWS = 300;
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function drawAll(type: ConceptType, tier: number): ConceptChallenge[] {
  return Array.from({ length: DRAWS }, () => generateConceptChallenge(type, tier));
}

/** The single-question draws. Most assertions here are about a button stack,
 *  and the two-part DOK-3 items are checked separately by their own block —
 *  so this narrows to the choice challenges rather than making every existing
 *  test carry a type guard. */
function draw(type: ConceptType, tier: number): ChoiceChallenge[] {
  return drawAll(type, tier).filter((c): c is ChoiceChallenge => c.kind === 'choice');
}

function drawSteps(type: ConceptType, tier: number): StepsChallenge[] {
  return drawAll(type, tier).filter((c): c is StepsChallenge => c.kind === 'steps');
}

describe('generateConceptChallenge', () => {
  // ChoiceChallenge's contract, which the host modal relies on: the answer has
  // to be one of the buttons, and there have to be between two and four of
  // them. A duplicated choice reads to a kid as two right answers.
  //
  // A steps challenge is checked leaf by leaf, because ChallengeInput renders
  // each part with exactly the same UI a standalone question would get — so
  // every part has to satisfy the same contract on its own.
  function expectRenderable(c: ConceptChallenge | Challenge, where: string) {
    expect(c.prompt.length, where).toBeGreaterThan(0);
    if (c.kind === 'steps') {
      expect(c.steps.length, where).toBeGreaterThanOrEqual(2);
      for (const s of c.steps) expectRenderable(s, `${where} / step`);
      return;
    }
    if (c.kind === 'numeric') {
      expect(Number.isInteger(c.answer), where).toBe(true);
      expect(c.answer, where).toBeGreaterThanOrEqual(0);
      // The keypad takes five digits. An answer longer than that cannot be
      // entered at all, which is a question the kid is guaranteed to fail.
      expect(String(c.answer).length, where).toBeLessThanOrEqual(5);
      return;
    }
    expect(c.choices, where).toContain(c.answer);
    expect(c.choices.length, where).toBeGreaterThanOrEqual(2);
    expect(c.choices.length, where).toBeLessThanOrEqual(4);
    expect(new Set(c.choices).size, `duplicate choice — ${where}`).toBe(c.choices.length);
  }

  it('always produces a renderable challenge', () => {
    for (const type of CONCEPT_TYPES) {
      for (const tier of TIERS) {
        for (const c of drawAll(type, tier)) {
          expectRenderable(c, `${type} @ ${tier}: ${c.prompt}`);
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

  // Everything below was written against a real 3rd-grade chapter test,
  // "Numbers to 10,000". The assertions are the sheet's own items: if a
  // generator can no longer produce the shape of question the class is
  // actually sitting, that is the regression worth catching.
  const num = (s: string) => Number(s.replace(/,/g, ''));

  describe('place-value to 10,000 — 2.NBT.A.1, 2.NBT.A.3, 3.NBT.A.2', () => {
    it('reaches four digits at tier 5 and never below tier 4', () => {
      const small = draw('place-value', 3).flatMap((c) => c.prompt.match(/\d[\d,]*/g) ?? []);
      expect(Math.max(...small.map(num))).toBeLessThan(1000);
      const big = draw('place-value', 5).flatMap((c) => c.prompt.match(/\d[\d,]*/g) ?? []);
      expect(Math.max(...big.map(num))).toBeGreaterThan(999);
    });

    // Q1 on the sheet. Naming the place a digit sits in is the inverse of
    // counting a place, and the generator only ever did the latter.
    it('asks which place a digit is in, and the digit really is there', () => {
      const asked = draw('place-value', 6).filter((c) => /Which place is the digit/.test(c.prompt));
      expect(asked.length).toBeGreaterThan(0);
      for (const c of asked) {
        const [, n, digit] = c.prompt.match(/number ([\d,]+)\. Which place is the digit (\d)/)!;
        const fromRight = ['ones', 'tens', 'hundreds', 'thousands'].indexOf(c.answer);
        expect(fromRight, c.prompt).toBeGreaterThanOrEqual(0);
        expect(Math.floor(num(n) / 10 ** fromRight) % 10, c.prompt).toBe(Number(digit));
      }
    });

    // Q3. The terms have to add back up to the number — and the interior zero
    // that makes the question worth asking has to actually occur.
    it('writes expanded form that sums to the number, zeroes included', () => {
      const forms = draw('place-value', 6).filter((c) => /expanded form/.test(c.prompt));
      expect(forms.length).toBeGreaterThan(0);
      for (const c of forms) {
        const n = num(c.prompt.match(/of ([\d,]+)\?/)![1]);
        const sum = c.answer.split(' + ').reduce((t, term) => t + num(term), 0);
        expect(sum, `${c.prompt} -> ${c.answer}`).toBe(n);
      }
      expect(forms.some((c) => /0/.test(c.prompt.match(/of ([\d,]+)\?/)![1].slice(1, -1)))).toBe(true);
    });

    // Q4 — "100 less than 2,075". Reads as subtraction, is place value.
    it('steps by a power of ten in both directions', () => {
      const steps = draw('place-value', 6).filter((c) => /more than|less than/.test(c.prompt));
      expect(steps.length).toBeGreaterThan(0);
      for (const c of steps) {
        const [, step, dir, n] = c.prompt.match(/is ([\d,]+) (more|less) than ([\d,]+)\?/)!;
        const want = dir === 'more' ? num(n) + num(step) : num(n) - num(step);
        expect(num(c.answer), c.prompt).toBe(want);
      }
      expect(steps.some((c) => / less than /.test(c.prompt))).toBe(true);
      expect(steps.some((c) => /is 1,000 /.test(c.prompt))).toBe(true);
    });

    // Q9's constructed response, as far as a button can carry it. The wrong
    // answer the item is built around — the digits left in the order they were
    // rolled — has to be on offer, or the question tests nothing.
    it('offers the as-rolled order as a choice when it is not the answer', () => {
      const rolls = draw('place-value', 6).filter((c) => /You roll /.test(c.prompt));
      expect(rolls.length).toBeGreaterThan(0);
      for (const c of rolls) {
        const ds = c.prompt.match(/roll an? (\d), an? (\d) and an? (\d)/)!.slice(1).map(Number);
        expect(num(c.answer), c.prompt).toBe(
          Number([...ds].sort((a, b) => b - a).join('')),
        );
      }
      const asRolled = rolls.filter((c) => {
        const ds = c.prompt.match(/roll an? (\d), an? (\d) and an? (\d)/)!.slice(1);
        return ds.join('') !== c.answer && c.choices.includes(ds.join(''));
      });
      expect(asRolled.length).toBeGreaterThan(0);
    });
  });

  describe('skip-count in the thousands — 2.NBT.A.2, 3.NBT.A.2', () => {
    const runs = () =>
      draw('skip-count', 6).filter((c) => c.subtext?.startsWith('Counting'));

    it('counts backward as well as up — 8,373 · 8,363 · 8,353', () => {
      const all = runs();
      expect(all.some((c) => /back by/.test(c.subtext!))).toBe(true);
      expect(all.some((c) => /up by/.test(c.subtext!))).toBe(true);
    });

    it('hides a term in the middle, not only at the end', () => {
      const middle = runs().filter((c) => !c.prompt.trimEnd().endsWith('?'));
      expect(middle.length).toBeGreaterThan(0);
      // A hidden middle term has numbers on BOTH sides — that is the whole
      // difference from "what comes next".
      for (const c of middle) {
        const parts = c.prompt.split(' · ');
        const at = parts.indexOf('?');
        expect(at, c.prompt).toBeGreaterThan(0);
        expect(at, c.prompt).toBeLessThan(parts.length - 1);
      }
    });

    it('fills the blank with the term the run actually reaches', () => {
      for (const c of runs()) {
        const parts = c.prompt.split(' · ');
        const filled = parts.map((p) => (p === '?' ? c.answer : p)).map(num);
        const step = filled[1] - filled[0];
        expect(step, c.prompt).not.toBe(0);
        for (let i = 1; i < filled.length; i++) {
          expect(filled[i] - filled[i - 1], `${c.prompt} -> ${c.answer}`).toBe(step);
        }
      }
    });

    // Q5: the number line runs 7,880 · 7,980 · ? · 8,180. Carrying across the
    // thousand is the only hard moment in the item, and a run that starts on a
    // multiple of its own step never gets there.
    it('carries a run across a thousand', () => {
      const crossing = runs().filter((c) => {
        const parts = c.prompt.split(' · ');
        const filled = parts.map((p) => (p === '?' ? c.answer : p)).map(num);
        return (
          Math.floor(filled[0] / 1000) !== Math.floor(filled[filled.length - 1] / 1000)
        );
      });
      expect(crossing.length).toBeGreaterThan(0);
    });
  });

  describe('rounding — 3.NBT.A.1', () => {
    const PLACES: Record<string, number> = { ten: 10, hundred: 100, thousand: 1000 };
    const rounds = (tier: number) =>
      draw('rounding', tier).filter((c) => /^Round /.test(c.prompt));

    it('rounds to the nearest, with halves going up', () => {
      for (const tier of TIERS) {
        for (const c of rounds(tier)) {
          const [, n, word] = c.prompt.match(/^Round ([\d,]+) to the nearest (\w+)\./)!;
          const place = PLACES[word];
          expect(num(c.answer), c.prompt).toBe(Math.round(num(n) / place) * place);
        }
      }
    });

    // Q7 and Q8A are nearest-ten; Q8B is nearest-hundred. Thousands are the
    // grade-4 extension and wait for tier 7.
    it('opens tens and hundreds for grade 3, thousands only later', () => {
      const words = (tier: number) =>
        new Set(rounds(tier).map((c) => c.prompt.match(/nearest (\w+)\./)![1]));
      expect(words(4)).toEqual(new Set(['ten']));
      expect(words(5)).toEqual(new Set(['ten', 'hundred']));
      expect(words(7).has('thousand')).toBe(true);
    });

    // The DOK-3 item: told the rounded value, find the greatest original. The
    // answer has to round back to what the prompt named, and the off-by-one
    // above it — the number that tips the other way — has to be on offer.
    it('runs rounding backwards at tier 7', () => {
      const reverse = draw('rounding', 8).filter((c) => /greatest it could be/.test(c.prompt));
      expect(reverse.length).toBeGreaterThan(0);
      for (const c of reverse) {
        const [, target, word] = c.prompt.match(/rounds to ([\d,]+) when rounded to the nearest (\w+)\./)!;
        const place = PLACES[word];
        const answer = num(c.answer);
        expect(Math.round(answer / place) * place, c.prompt).toBe(num(target));
        expect(Math.round((answer + 1) / place) * place, c.prompt).not.toBe(num(target));
      }
    });

    it('is not offered below tier 5 as anything but tens', () => {
      expect(draw('rounding', 2).every((c) => /nearest ten\./.test(c.prompt))).toBe(true);
    });
  });

  // The three items on the sheet that a single button could not carry: two
  // that say "show your work" and one that says "explain the mistake".
  describe('the DOK-3 items, asked in parts', () => {
    it('asks the reason after the answer, never instead of it', () => {
      for (const type of ['place-value', 'rounding'] as ConceptType[]) {
        const stepped = drawSteps(type, 8);
        expect(stepped.length, type).toBeGreaterThan(0);
        for (const c of stepped) {
          // Every one is answer-then-justify or work-then-work: the first part
          // is always something the kid computes, never a reason to pick.
          expect(c.steps[0].kind, c.prompt).toBe('numeric');
          expect(c.steps.length, c.prompt).toBe(2);
        }
      }
    });

    // Q6: 1,345 − 100 − 100. The middle value is the work, and it has to be
    // required rather than implied, or the item is a one-step question.
    it('chains the work so the second part needs the first', () => {
      const chained = drawSteps('place-value', 8).filter((c) => /baker/.test(c.prompt));
      expect(chained.length).toBeGreaterThan(0);
      for (const c of chained) {
        const perDay = Number(c.prompt.match(/uses (\d+) ounces/)![1]);
        const start = Number(c.prompt.match(/are ([\d,]+) ounces/)![1].replace(/,/g, ''));
        const [tue, wed] = c.steps.map((s) => (s as { answer: number }).answer);
        expect(tue, c.prompt).toBe(start - perDay);
        expect(wed, c.prompt).toBe(start - perDay * 2);
      }
    });

    // Q9: the reason list has to contain Sadie's actual mistake, or the second
    // part is not asking anything.
    it("offers the misconception as a reason, not just wrong reasons", () => {
      const rolls = drawSteps('place-value', 8).filter((c) => /You roll/.test(c.prompt));
      expect(rolls.length).toBeGreaterThan(0);
      for (const c of rolls) {
        const reason = c.steps[1] as { answer: string; choices: string[] };
        expect(reason.answer).toBe('The biggest digit goes in the place worth the most');
        expect(
          reason.choices.some((r) => /is already in the place worth the most/.test(r)),
          c.prompt,
        ).toBe(true);
      }
    });

    // Q8C: the justification has to name the number that tips over, and that
    // number really has to tip over.
    it('justifies the reverse-rounding answer with the number that tips', () => {
      const reverse = drawSteps('rounding', 8);
      expect(reverse.length).toBeGreaterThan(0);
      const PLACES: Record<string, number> = { ten: 10, hundred: 100, thousand: 1000 };
      for (const c of reverse) {
        const [, target, word] = c.prompt.match(/rounds to ([\d,]+) when rounded to the nearest (\w+)\./)!;
        const place = PLACES[word];
        const t = Number(target.replace(/,/g, ''));
        const answer = (c.steps[0] as { answer: number }).answer;
        expect(Math.round(answer / place) * place, c.prompt).toBe(t);
        const reason = c.steps[1] as { answer: string };
        const tips = Number(reason.answer.match(/^([\d,]+)/)![1].replace(/,/g, ''));
        expect(tips, reason.answer).toBe(answer + 1);
        expect(Math.round(tips / place) * place, reason.answer).not.toBe(t);
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
