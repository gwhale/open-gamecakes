import { describe, expect, it } from 'vitest';
import {
  INTRO_IDS,
  MAX_HINT,
  MISSIONS,
  TUNE_PHRASES,
  fifthWalk,
  findMiss,
  hintFor,
  instruction,
  isHomeDegree,
  isMissionOpen,
  nextMission,
  phrasePitches,
  unlockedKeys,
  type FifthMission,
  type FindMission,
} from './missions';
import { keyOf, pcName, pcOf, pitchName, spellInKey, midiOf } from './theory';

describe('progression', () => {
  it('starts on C with only the introduction open', () => {
    expect(unlockedKeys([])).toEqual(['C']);
    expect(nextMission([])?.id).toBe('c-explore');
    const open = MISSIONS.filter((m) => isMissionOpen(m, []));
    expect(open.map((m) => m.id)).toEqual([...INTRO_IDS]);
  });

  it('opens G and F once the C introduction is done', () => {
    expect(unlockedKeys(INTRO_IDS)).toEqual(['C', 'G', 'F']);
    expect(MISSIONS.every((m) => isMissionOpen(m, INTRO_IDS))).toBe(true);
    expect(nextMission(INTRO_IDS)?.id).toBe('g-explore');
  });

  it('runs out of missions when everything is done', () => {
    expect(nextMission(MISSIONS.map((m) => m.id))).toBeNull();
  });

  it('only uses the three lesson planets', () => {
    for (const m of MISSIONS) expect(['C', 'G', 'F']).toContain(m.key);
  });
});

describe('every mission has a complete path', () => {
  it('has an instruction and two levels of hint', () => {
    for (const m of MISSIONS) {
      expect(instruction(m).length, m.id).toBeGreaterThan(10);
      expect(hintFor(m, 0)).toBeNull();
      expect(hintFor(m, 1)?.text, m.id).toBeTruthy();
      const strong = hintFor(m, MAX_HINT);
      expect(strong?.text, m.id).toBeTruthy();
      if (m.kind !== 'explore') expect(strong!.pcs ?? strong!.choice, `${m.id} shows the answer`).toBeDefined();
    }
  });

  it('find targets are actually in their key', () => {
    for (const m of MISSIONS.filter((x): x is FindMission => x.kind === 'find')) {
      const spelled = spellInKey(keyOf(m.key), midiOf({ ...m.target, octave: 4 }));
      expect(spelled && pcName(spelled), m.id).toBe(pcName(m.target));
    }
  });

  it('points at the black key when the plain letter is tapped', () => {
    const g = MISSIONS.find((m) => m.id === 'g-fsharp') as FindMission;
    expect(findMiss(g, { letter: 'F', acc: 0 })).toMatch(/every F becomes F♯.*right/);
    const f = MISSIONS.find((m) => m.id === 'f-bflat') as FindMission;
    expect(findMiss(f, { letter: 'B', acc: 0 })).toMatch(/every B becomes B♭.*left/);
  });
});

describe('finish the tune', () => {
  it('offers exactly one home note, never the note the phrase stops on', () => {
    for (const p of Object.values(TUNE_PHRASES)) {
      expect(p.choices.filter(isHomeDegree), p.id).toHaveLength(1);
      expect(p.choices, p.id).not.toContain(p.notes.at(-1)!.deg);
    }
  });

  it('transposes into each key with the right accidentals', () => {
    const climbG = phrasePitches('G', TUNE_PHRASES.climb).map((n) => pitchName(n.pitch));
    expect(climbG).toEqual(['G4', 'B4', 'D5', 'E5', 'F♯5']);
    const stairsF = phrasePitches('F', TUNE_PHRASES.stairs).map((n) => pitchName(n.pitch));
    expect(stairsF).toEqual(['C5', 'B♭4', 'A4', 'G4']);
  });
});

describe('visit the next fifth', () => {
  it('counts five notes from C up to G and down to F', () => {
    const up = MISSIONS.find((m) => m.id === 'fifth-up') as FifthMission;
    const down = MISSIONS.find((m) => m.id === 'fifth-down') as FifthMission;
    expect(fifthWalk(up).map(pitchName)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    expect(fifthWalk(down).map(pitchName)).toEqual(['C5', 'B4', 'A4', 'G4', 'F4']);
    expect(pcOf(fifthWalk(up).at(-1)!)).toBe(pcOf(keyOf(up.to).tonic));
    expect(pcOf(fifthWalk(down).at(-1)!)).toBe(pcOf(keyOf(down.to).tonic));
  });
});
