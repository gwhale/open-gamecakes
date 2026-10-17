// Musical Planets — the missions, their hints, and what unlocks what.
//
// Pure: no React, no audio, no storage. The host asks this module what to say
// and what to light up; the tests check that every mission has a complete
// path (instruction → answer → feedback → hints → replay) without a browser.
//
// The learning order is the PRD's: C major first (no accidentals), and
// finishing its short introduction opens G (one sharp) and F (one flat).
// Nothing is ever re-locked, and a kid can replay anything they have done.

import {
  degree,
  keyName,
  keyOf,
  majorScale,
  pcName,
  pcOf,
  signatureWords,
  spokenName,
  type KeyId,
  type Pitch,
  type PitchClass,
} from './theory';

export type MissionKind = 'explore' | 'find' | 'match' | 'tune' | 'fifth';

interface MissionBase {
  id: string;
  kind: MissionKind;
  /** The planet this mission happens on. */
  key: KeyId;
  /** Short title on the mission chip. Early readers: a few words. */
  title: string;
  glyph: string;
}

export interface ExploreMission extends MissionBase { kind: 'explore' }
export interface FindMission extends MissionBase { kind: 'find'; target: PitchClass; prompt: string }
export interface MatchMission extends MissionBase { kind: 'match'; rounds: readonly KeyId[] }
export interface TuneMission extends MissionBase { kind: 'tune'; phrase: TunePhrase }
export interface FifthMission extends MissionBase { kind: 'fifth'; to: KeyId; direction: 'up' | 'down' }

export type Mission = ExploreMission | FindMission | MatchMission | TuneMission | FifthMission;

/** The three planets a first-release kid can land on. */
export const LESSON_KEYS: readonly KeyId[] = ['C', 'G', 'F'];

// ---------------------------------------------------------------------------
// Finish the tune
// ---------------------------------------------------------------------------

export interface TuneNote {
  /** Scale degree: 1 is the home note, 8 the home note an octave up, 0 the
   *  note just below home. Written in degrees so one phrase plays in any key. */
  deg: number;
  /** Length in beats. */
  beats: number;
}

export interface TunePhrase {
  id: string;
  /** Everything before the missing last note. */
  notes: readonly TuneNote[];
  /** Degrees offered as the last note. Exactly one is a home note. */
  choices: readonly number[];
}

/** The phrases are DELIBERATELY obvious: each one leans hard on the home note
 *  (a falling line, a climb to the leading note, a nursery tune everyone has
 *  heard) so that the wrong endings sound unfinished to a beginner, not just
 *  to a theory teacher. Choices avoid the note the phrase stops on, so a kid
 *  never "finishes" by repeating it. */
export const TUNE_PHRASES: Record<string, TunePhrase> = {
  // "How I won-der what you are" — the last line of Twinkle Twinkle.
  twinkle: {
    id: 'twinkle',
    notes: [
      { deg: 4, beats: 1 }, { deg: 4, beats: 1 }, { deg: 3, beats: 1 }, { deg: 3, beats: 1 },
      { deg: 2, beats: 1 }, { deg: 2, beats: 1 },
    ],
    choices: [1, 5, 6],
  },
  // Up the stairs to the leading note, which all but begs for home.
  climb: {
    id: 'climb',
    notes: [
      { deg: 1, beats: 1 }, { deg: 3, beats: 1 }, { deg: 5, beats: 1 }, { deg: 6, beats: 1 }, { deg: 7, beats: 2 },
    ],
    choices: [8, 6, 4],
  },
  // Down the stairs from the fifth.
  stairs: {
    id: 'stairs',
    notes: [
      { deg: 5, beats: 1 }, { deg: 4, beats: 1 }, { deg: 3, beats: 1 }, { deg: 2, beats: 2 },
    ],
    choices: [1, 4, 6],
  },
};

export function isHomeDegree(deg: number): boolean {
  return (((deg - 1) % 7) + 7) % 7 === 0;
}

/** The phrase's notes as pitches in a key, ready for the synth. */
export function phrasePitches(key: KeyId, phrase: TunePhrase): { pitch: Pitch; beats: number }[] {
  const k = keyOf(key);
  return phrase.notes.map((n) => ({ pitch: degree(k, n.deg), beats: n.beats }));
}

// ---------------------------------------------------------------------------
// The mission list
// ---------------------------------------------------------------------------

export const MISSIONS: readonly Mission[] = [
  // ---- the C major introduction ----
  { id: 'c-explore', kind: 'explore', key: 'C', title: 'Visit planet C', glyph: '🪐' },
  {
    id: 'c-home', kind: 'find', key: 'C', title: 'Find home', glyph: '🏠',
    target: { letter: 'C', acc: 0 },
    prompt: 'Find the home note of C major. Tap any C!',
  },
  { id: 'c-tune', kind: 'tune', key: 'C', title: 'Finish the tune', glyph: '🎵', phrase: TUNE_PHRASES.twinkle },

  // ---- G and F open together ----
  { id: 'g-explore', kind: 'explore', key: 'G', title: 'Visit planet G', glyph: '🪐' },
  {
    id: 'g-fsharp', kind: 'find', key: 'G', title: 'Find F♯', glyph: '♯',
    target: { letter: 'F', acc: 1 },
    prompt: 'G major has F♯. Can you find it?',
  },
  { id: 'f-explore', kind: 'explore', key: 'F', title: 'Visit planet F', glyph: '🪐' },
  {
    id: 'f-bflat', kind: 'find', key: 'F', title: 'Find B♭', glyph: '♭',
    target: { letter: 'B', acc: -1 },
    prompt: 'F major has B♭. Can you find it?',
  },
  { id: 'fifth-up', kind: 'fifth', key: 'C', to: 'G', direction: 'up', title: 'Fly to the fifth', glyph: '🚀' },
  { id: 'fifth-down', kind: 'fifth', key: 'C', to: 'F', direction: 'down', title: 'Fly the other way', glyph: '🛸' },
  { id: 'match', kind: 'match', key: 'C', title: 'Match the sign', glyph: '🔍', rounds: ['G', 'C', 'F'] },
  { id: 'g-tune', kind: 'tune', key: 'G', title: 'Finish G’s tune', glyph: '🎵', phrase: TUNE_PHRASES.climb },
  { id: 'f-tune', kind: 'tune', key: 'F', title: 'Finish F’s tune', glyph: '🎵', phrase: TUNE_PHRASES.stairs },
];

/** Finishing these opens G and F. */
export const INTRO_IDS: readonly string[] = ['c-explore', 'c-home', 'c-tune'];

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function introDone(completed: readonly string[]): boolean {
  return INTRO_IDS.every((id) => completed.includes(id));
}

export function unlockedKeys(completed: readonly string[]): KeyId[] {
  return introDone(completed) ? ['C', 'G', 'F'] : ['C'];
}

/** A mission is open when every planet it touches is unlocked. Intro missions
 *  are always open, so there is never a dead end on the first visit. */
export function isMissionOpen(m: Mission, completed: readonly string[]): boolean {
  if (INTRO_IDS.includes(m.id)) return true;
  return introDone(completed);
}

/** Where to go next: the first open mission not yet done, or null when the
 *  whole first release is complete. */
export function nextMission(completed: readonly string[]): Mission | null {
  return MISSIONS.find((m) => isMissionOpen(m, completed) && !completed.includes(m.id)) ?? null;
}

// ---------------------------------------------------------------------------
// Instructions, answers, feedback
// ---------------------------------------------------------------------------

/** Clockwise from C counts UP a fifth, counterclockwise counts DOWN one. */
export function fifthWalk(m: FifthMission): Pitch[] {
  const c = keyOf(m.key);
  // Up: degrees 1..5 of the starting key. Down: 8, 7, 6, 5, 4 — the same key's
  // own notes stepping down, which lands on the planet a fifth below.
  const degs = m.direction === 'up' ? [1, 2, 3, 4, 5] : [8, 7, 6, 5, 4];
  return degs.map((d) => degree(c, d));
}

export function instruction(m: Mission, round = 0): string {
  switch (m.kind) {
    case 'explore':
      return `This is ${keyName(keyOf(m.key))}. Its home note is ${m.key}. Tap “Hear the scale” and play along!`;
    case 'find':
      return m.prompt;
    case 'match':
      return round === 0
        ? 'Look at the key signature. Which planet is it from?'
        : 'Here’s another one. Which planet?';
    case 'tune':
      return 'Listen to the tune. Which note brings it home?';
    case 'fifth':
      return m.direction === 'up'
        ? 'Count up from C on the white keys: tap C, D, E, F, G. Five notes!'
        : 'Now count DOWN from high C: tap C, B, A, G, F. Five notes!';
  }
}

/** Why a tapped piano key is not the target. Never "wrong"; says what the key
 *  IS, then points toward the answer. */
export function findMiss(m: FindMission, tapped: PitchClass): string {
  const name = pcName(tapped);
  if (tapped.letter === m.target.letter && m.target.acc !== 0) {
    const side = m.target.acc === 1 ? 'right' : 'left';
    return `That’s ${name}. In ${keyName(keyOf(m.key))}, every ${m.target.letter} becomes ${pcName(m.target)}. Try the black key just to the ${side}.`;
  }
  return `That’s ${name}. Keep looking for ${pcName(m.target)}!`;
}

export function findHit(m: FindMission): string {
  if (m.target.acc === 0) return `Yes! That’s ${pcName(m.target)}, the home note. Every ${m.target.letter} on the piano is home.`;
  return `Yes! ${pcName(m.target)}! The key signature turns every ${m.target.letter} into ${pcName(m.target)}, high and low.`;
}

export function matchMiss(shown: KeyId, picked: KeyId): string {
  return `${keyName(keyOf(picked))} has ${signatureWords(keyOf(picked))}. This one has ${signatureWords(keyOf(shown))}.`;
}

export function matchHit(shown: KeyId): string {
  const k = keyOf(shown);
  if (k.signature === 0) return 'Yes! No sharps or flats is C major. All white keys.';
  return `Yes! ${signatureWords(k)} is ${keyName(k)}. Listen for ${pcName(majorScale(k).find((p) => p.acc !== 0)!)} in the scale.`;
}

export function tuneMiss(deg: number): string {
  return deg === 5
    ? 'Hmm, that sounds like it wants to keep going. Try another!'
    : 'Close! But the tune doesn’t feel finished yet. Try another!';
}

export function tuneHit(key: KeyId): string {
  return `Home! The tune ends on ${key}, the home note of ${keyName(keyOf(key))}.`;
}

export function fifthDone(m: FifthMission): string {
  const to = keyOf(m.to);
  return m.direction === 'up'
    ? `C, D, E, F, G: five notes! G is a FIFTH above C. Its planet is next door, clockwise, and it has one sharp.`
    : `C, B, A, G, F: five notes down! F is a fifth below C. Its planet is next door the other way, and it has ${signatureWords(to)}.`;
}

// ---------------------------------------------------------------------------
// Hints — each tap of the hint button makes the next one clearer
// ---------------------------------------------------------------------------

export interface Hint {
  text: string;
  /** Pitch classes to glow on the piano (every octave). */
  pcs?: number[];
  /** A choice button to glow (match: a key; tune: a degree). */
  choice?: KeyId | number;
}

export const MAX_HINT = 2;

/** Level 1 names the note or the idea; level 2 shows exactly where. `step` is
 *  the index of the next key to tap in a fifth walk, or the match round. */
export function hintFor(m: Mission, level: number, step = 0): Hint | null {
  if (level <= 0) return null;
  const strong = level >= MAX_HINT;
  switch (m.kind) {
    case 'explore':
      return { text: 'Tap the big “Hear the scale” button. The keys light up as they play.' };
    case 'find':
      return strong
        ? { text: `Here it is! The glowing keys are all ${pcName(m.target)}.`, pcs: [pcOf(m.target)] }
        : { text: `Look for the note called ${spokenName(m.target)}${m.target.acc !== 0 ? ', a black key' : ''}.` };
    case 'match': {
      const shown = m.rounds[step % m.rounds.length];
      return strong
        ? { text: `${signatureWords(keyOf(shown))} belongs to ${keyName(keyOf(shown))}.`, choice: shown }
        : { text: 'Count the marks after the clef. None? One sharp ♯? One flat ♭?' };
    }
    case 'tune': {
      const home = m.phrase.choices.find(isHomeDegree)!;
      return strong
        ? { text: `The home note of ${keyName(keyOf(m.key))} is ${m.key}. It’s glowing.`, choice: home, pcs: [pcOf(keyOf(m.key).tonic)] }
        : { text: 'A tune sounds finished when it lands on its home note. Try each one and listen.' };
    }
    case 'fifth': {
      const walk = fifthWalk(m);
      const next = walk[Math.min(step, walk.length - 1)];
      return strong
        ? { text: `Tap the glowing ${pcName(next)}.`, pcs: [pcOf(next)] }
        : { text: `Next is ${pcName(next)}. ${m.direction === 'up' ? 'Step up' : 'Step down'} one white key.` };
    }
  }
}
