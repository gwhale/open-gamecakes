import { describe, expect, it } from 'vitest';
import {
  ALL_KEYS,
  changedNotes,
  degree,
  frequencyOf,
  keyLabels,
  keyName,
  keyOf,
  majorScale,
  midiOf,
  pcName,
  pianoKeys,
  pitchName,
  signatureAccidental,
  signatureMarks,
  spellInKey,
  staffStep,
  tonicTriad,
} from './theory';

const names = (ps: { letter: string; acc: number; octave?: number }[]) =>
  ps.map((p) => pcName(p as never));

describe('pitch arithmetic', () => {
  it('puts middle C at MIDI 60 and A4 at 440 Hz', () => {
    expect(midiOf({ letter: 'C', acc: 0, octave: 4 })).toBe(60);
    expect(frequencyOf(69)).toBeCloseTo(440);
    expect(frequencyOf(60)).toBeCloseTo(261.63, 1);
  });

  it('counts staff steps from the bottom line of the treble staff', () => {
    expect(staffStep({ letter: 'E', acc: 0, octave: 4 })).toBe(0);
    expect(staffStep({ letter: 'F', acc: 1, octave: 5 })).toBe(8); // top line
    expect(staffStep({ letter: 'B', acc: -1, octave: 4 })).toBe(4); // middle line
    expect(staffStep({ letter: 'C', acc: 0, octave: 4 })).toBe(-2); // ledger line
  });
});

describe('the three lesson keys', () => {
  it('C major has no sharps or flats', () => {
    const c = keyOf('C');
    expect(c.signature).toBe(0);
    expect(signatureMarks(c)).toEqual([]);
    expect(names(majorScale(c))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
  });

  it('G major has one sharp, F♯, on the top line', () => {
    const g = keyOf('G');
    expect(g.signature).toBe(1);
    const marks = signatureMarks(g);
    expect(marks).toHaveLength(1);
    expect(pitchName(marks[0].pitch)).toBe('F♯5');
    expect(staffStep(marks[0].pitch)).toBe(8);
    expect(names(majorScale(g))).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F♯', 'G']);
  });

  it('F major has one flat, B♭, on the middle line', () => {
    const f = keyOf('F');
    expect(f.signature).toBe(-1);
    const marks = signatureMarks(f);
    expect(pitchName(marks[0].pitch)).toBe('B♭4');
    expect(staffStep(marks[0].pitch)).toBe(4);
    expect(names(majorScale(f))).toEqual(['F', 'G', 'A', 'B♭', 'C', 'D', 'E', 'F']);
  });

  it('tonic chords', () => {
    expect(tonicTriad(keyOf('C')).map(pitchName)).toEqual(['C4', 'E4', 'G4']);
    expect(tonicTriad(keyOf('G')).map(pitchName)).toEqual(['G4', 'B4', 'D5']);
    expect(tonicTriad(keyOf('F')).map(pitchName)).toEqual(['F4', 'A4', 'C5']);
  });
});

describe('every key on the circle', () => {
  it('goes clockwise by a fifth and adds a sharp (or loses a flat)', () => {
    for (let i = 0; i < 12; i++) {
      const a = ALL_KEYS[i];
      const b = ALL_KEYS[(i + 1) % 12];
      const up = (midiOf({ ...b.tonic, octave: 4 }) - midiOf({ ...a.tonic, octave: 4 }) + 12) % 12;
      expect(up, `${keyName(a)} → ${keyName(b)}`).toBe(7);
      const diff = (b.signature - a.signature + 12) % 12;
      expect(diff, `${keyName(a)} → ${keyName(b)}`).toBe(1);
    }
  });

  it('agrees with itself: the scale built by interval is the key signature', () => {
    for (const k of ALL_KEYS) {
      for (const p of majorScale(k)) {
        expect(p.acc, `${keyName(k)} ${p.letter}`).toBe(signatureAccidental(k, p.letter));
      }
      expect(changedNotes(k)).toHaveLength(Math.abs(k.signature));
    }
  });

  it('uses each letter exactly once per scale', () => {
    for (const k of ALL_KEYS) {
      const letters = majorScale(k).slice(0, 7).map((p) => p.letter);
      expect(new Set(letters).size).toBe(7);
    }
  });

  it('engraves the standard sharp and flat zig-zags', () => {
    expect(signatureMarks(keyOf('F#')).map((m) => pitchName(m.pitch))).toEqual([
      'F♯5', 'C♯5', 'G♯5', 'D♯5', 'A♯4', 'E♯5',
    ]);
    expect(signatureMarks(keyOf('Db')).map((m) => pitchName(m.pitch))).toEqual([
      'B♭4', 'E♭5', 'A♭4', 'D♭5', 'G♭4',
    ]);
  });
});

describe('scale degrees', () => {
  it('reaches below and above the tonic', () => {
    const c = keyOf('C');
    expect(pitchName(degree(c, 1))).toBe('C4');
    expect(pitchName(degree(c, 8))).toBe('C5');
    expect(pitchName(degree(c, 0))).toBe('B3');
    expect(pitchName(degree(c, 5))).toBe('G4');
    expect(pitchName(degree(keyOf('G'), 7))).toBe('F♯5');
  });
});

describe('the piano', () => {
  it('runs C4 to C6 with 15 white keys', () => {
    const keys = pianoKeys();
    expect(keys[0].midi).toBe(60);
    expect(keys.at(-1)!.midi).toBe(84);
    expect(keys.filter((k) => !k.black)).toHaveLength(15);
  });

  it('spells a black key both ways, and in a key the right way', () => {
    expect(keyLabels(66)).toEqual(['F♯', 'G♭']);
    expect(pcName(spellInKey(keyOf('G'), 66)!)).toBe('F♯');
    expect(pcName(spellInKey(keyOf('F'), 70)!)).toBe('B♭');
    expect(spellInKey(keyOf('C'), 66)).toBeNull();
  });
});
