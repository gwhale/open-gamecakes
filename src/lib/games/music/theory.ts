// Musical Planets — the one source of musical truth.
//
// The circle, the staff, the piano and every mission read from here, so the
// four can never disagree about what G major is. Nothing in this file knows
// about React, three.js or audio; it is pure data and arithmetic, and the
// tests pin it to the textbook.
//
// Spelling matters. A key signature is a list of LETTERS that change, so a
// pitch here is a letter plus an accidental plus an octave, never just a MIDI
// number: F♯ and G♭ are the same piano key and different notes on a staff.

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
/** -1 flat, 0 natural, +1 sharp. No major key on the circle needs a double. */
export type Accidental = -1 | 0 | 1;

export interface PitchClass {
  letter: Letter;
  acc: Accidental;
}

export interface Pitch extends PitchClass {
  /** Scientific pitch notation: middle C is C4. */
  octave: number;
}

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_SEMITONE: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Semitones above the tonic for each degree of a major scale. */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

/** Order in which sharps and flats enter a key signature. */
export const SHARP_ORDER: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER: readonly Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Treble-staff octave for each accidental in a signature, in signature order.
 *  The standard engraved shape: sharps zig-zag F5 C5 G5 D5 A4 E5 B4, flats
 *  B4 E5 A4 D5 G4 C5 F4. Anything else reads as wrong to a teacher. */
const SHARP_OCTAVES = [5, 5, 5, 5, 4, 5, 4] as const;
const FLAT_OCTAVES = [4, 5, 4, 5, 4, 5, 4] as const;

export const SHARP = '♯';
export const FLAT = '♭';

// ---------------------------------------------------------------------------
// Pitch arithmetic
// ---------------------------------------------------------------------------

export function midiOf(p: Pitch): number {
  return 12 * (p.octave + 1) + LETTER_SEMITONE[p.letter] + p.acc;
}

/** 0..11, C = 0. Which piano key, ignoring octave. */
export function pcOf(p: PitchClass): number {
  return (((LETTER_SEMITONE[p.letter] + p.acc) % 12) + 12) % 12;
}

export function frequencyOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function accSymbol(acc: Accidental): string {
  return acc === 1 ? SHARP : acc === -1 ? FLAT : '';
}

/** "F♯" */
export function pcName(p: PitchClass): string {
  return p.letter + accSymbol(p.acc);
}

/** "F♯4" */
export function pitchName(p: Pitch): string {
  return pcName(p) + p.octave;
}

/** "F-sharp" — for screen readers and spoken lines, where ♯ is not read out. */
export function spokenName(p: PitchClass): string {
  return p.letter + (p.acc === 1 ? '-sharp' : p.acc === -1 ? '-flat' : '');
}

export function samePc(a: PitchClass, b: PitchClass): boolean {
  return pcOf(a) === pcOf(b);
}

/** Diatonic step on the treble staff, counted from the bottom line (E4 = 0).
 *  Even steps are lines, odd are spaces. Accidentals do not move a note. */
export function staffStep(p: Pitch): number {
  return p.octave * 7 + LETTERS.indexOf(p.letter) - (4 * 7 + 2);
}

// ---------------------------------------------------------------------------
// Keys and the circle
// ---------------------------------------------------------------------------

export type KeyId = 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#' | 'Db' | 'Ab' | 'Eb' | 'Bb' | 'F';

export interface MajorKey {
  id: KeyId;
  tonic: PitchClass;
  /** Positive = sharps, negative = flats. */
  signature: number;
  /** Position on the circle, 0 at the top, counting clockwise. */
  index: number;
}

const TONICS: Record<KeyId, PitchClass> = {
  C: { letter: 'C', acc: 0 },
  G: { letter: 'G', acc: 0 },
  D: { letter: 'D', acc: 0 },
  A: { letter: 'A', acc: 0 },
  E: { letter: 'E', acc: 0 },
  B: { letter: 'B', acc: 0 },
  'F#': { letter: 'F', acc: 1 },
  Db: { letter: 'D', acc: -1 },
  Ab: { letter: 'A', acc: -1 },
  Eb: { letter: 'E', acc: -1 },
  Bb: { letter: 'B', acc: -1 },
  F: { letter: 'F', acc: 0 },
};

/** Clockwise from the top. Each step clockwise is a fifth up and one more
 *  sharp (or one fewer flat). The bottom planet is F♯ major, six sharps; its
 *  twin G♭ major (six flats) is the same planet and is named on its label. */
export const CIRCLE: readonly KeyId[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

export function keyOf(id: KeyId): MajorKey {
  const index = CIRCLE.indexOf(id);
  return { id, tonic: TONICS[id], signature: index <= 6 ? index : index - 12, index };
}

export const ALL_KEYS: readonly MajorKey[] = CIRCLE.map(keyOf);

/** "G major", "F♯ major". */
export function keyName(k: MajorKey): string {
  return `${pcName(k.tonic)} major`;
}

/** "no sharps or flats", "1 sharp", "2 flats". */
export function signatureWords(k: MajorKey): string {
  const n = Math.abs(k.signature);
  if (n === 0) return 'no sharps or flats';
  const word = k.signature > 0 ? 'sharp' : 'flat';
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export interface SignatureMark {
  pitch: Pitch;
  acc: Accidental;
}

/** The accidentals of a key signature, in engraving order, each at its
 *  standard treble-staff position. */
export function signatureMarks(k: MajorKey): SignatureMark[] {
  const n = Math.abs(k.signature);
  if (k.signature > 0) {
    return SHARP_ORDER.slice(0, n).map((letter, i) => ({ pitch: { letter, acc: 1, octave: SHARP_OCTAVES[i] }, acc: 1 }));
  }
  return FLAT_ORDER.slice(0, n).map((letter, i) => ({ pitch: { letter, acc: -1, octave: FLAT_OCTAVES[i] }, acc: -1 }));
}

/** What the key signature does to a letter, in every octave. */
export function signatureAccidental(k: MajorKey, letter: Letter): Accidental {
  const n = Math.abs(k.signature);
  if (k.signature > 0 && SHARP_ORDER.slice(0, n).includes(letter)) return 1;
  if (k.signature < 0 && FLAT_ORDER.slice(0, n).includes(letter)) return -1;
  return 0;
}

/** The notes the key signature changes ("F♯" for G major). */
export function changedNotes(k: MajorKey): PitchClass[] {
  return signatureMarks(k).map((m) => ({ letter: m.pitch.letter, acc: m.acc }));
}

/** The major scale from the tonic in `octave`, eight notes, tonic to tonic.
 *  Built by interval, not by reading the signature, so the test that the two
 *  agree is a real check. */
export function majorScale(k: MajorKey, octave = 4): Pitch[] {
  const start = LETTERS.indexOf(k.tonic.letter);
  const tonicMidi = midiOf({ ...k.tonic, octave });
  const out: Pitch[] = [];
  for (let d = 0; d < 8; d++) {
    const li = start + d;
    const letter = LETTERS[li % 7];
    const oct = octave + Math.floor(li / 7);
    const natural = midiOf({ letter, acc: 0, octave: oct });
    const want = tonicMidi + (d === 7 ? 12 : MAJOR_STEPS[d]);
    out.push({ letter, acc: (want - natural) as Accidental, octave: oct });
  }
  return out;
}

/** Scale degree `degree` (1 = tonic; 8 = tonic an octave up; 0 or below
 *  reaches under the tonic, so 0 is the 7th below) in `octave`. */
export function degree(k: MajorKey, deg: number, octave = 4): Pitch {
  const zero = deg - 1;
  const oct = Math.floor(zero / 7);
  const idx = ((zero % 7) + 7) % 7;
  const p = majorScale(k, octave + oct)[idx];
  return p;
}

/** Tonic chord: degrees 1, 3, 5. */
export function tonicTriad(k: MajorKey, octave = 4): Pitch[] {
  const s = majorScale(k, octave);
  return [s[0], s[2], s[4]];
}

/** Is this piano key (MIDI) in the key? Returns its spelling in that key. */
export function spellInKey(k: MajorKey, midi: number): PitchClass | null {
  const pc = ((midi % 12) + 12) % 12;
  return majorScale(k).find((p) => pcOf(p) === pc) ?? null;
}

// ---------------------------------------------------------------------------
// The piano
// ---------------------------------------------------------------------------

/** The on-screen keyboard: C4 to C6. Covers every scale the missions use
 *  (C4–C5, F4–F5, G4–G5) with an octave to spare, so "every F" can be seen to
 *  mean more than one key. */
export const PIANO_LOW = 60;
export const PIANO_HIGH = 84;

export interface PianoKey {
  midi: number;
  black: boolean;
  /** Default spelling: white keys by letter, black keys as the sharp. */
  natural: Pitch;
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export function pianoKeys(low = PIANO_LOW, high = PIANO_HIGH): PianoKey[] {
  const keys: PianoKey[] = [];
  for (let m = low; m <= high; m++) {
    const pc = m % 12;
    const octave = Math.floor(m / 12) - 1;
    const black = BLACK_PCS.has(pc);
    const letterPc = black ? pc - 1 : pc;
    const letter = LETTERS.find((l) => LETTER_SEMITONE[l] === letterPc)!;
    keys.push({ midi: m, black, natural: { letter, acc: black ? 1 : 0, octave } });
  }
  return keys;
}

/** Both spellings of a black key ("C♯ / D♭"); a white key's letter. */
export function keyLabels(midi: number): string[] {
  const k = pianoKeys(midi, midi)[0];
  if (!k.black) return [k.natural.letter];
  const up = LETTERS[(LETTERS.indexOf(k.natural.letter) + 1) % 7];
  return [`${k.natural.letter}${SHARP}`, `${up}${FLAT}`];
}
