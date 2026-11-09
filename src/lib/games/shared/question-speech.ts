// What Cakey says when a question opens: the whole question, in words a voice
// can read.
//
// Before this, the only thing spoken was a choice question's `speak` field —
// the bare spelling word. The prompt itself was never read, and numeric and
// multi-part questions were silent, so a kid who cannot read the prompt yet
// heard "cat" and nothing else.
//
// Answer choices are NOT read. For spelling they must not be (hearing four
// spellings of a word read aloud is the same word four times), and for the
// rest the buttons are the kid's part of the job.

import type { Challenge } from './challenge';

/** A label, not part of the question: it says where the word came from. */
const SOURCE_LABEL = /^from your word list$/i;

/** Turn on-screen notation into something a voice reads correctly.
 *
 *  Operators are only rewritten with a space either side, so "-ing" in
 *  "Add -ing to RUN" stays a suffix. Capitalised words are lowercased because
 *  browser voices tend to spell an all-caps word out letter by letter, and
 *  "S-T-R-O-L-L" is not the word the kid is meant to hear. */
export function toSpeakable(text: string): string {
  return text
    .replace(/_{2,}/g, 'blank')
    .replace(/❓/g, 'what')
    .replace(/ \+ /g, ' plus ')
    .replace(/ [−-] /g, ' minus ')
    .replace(/ × /g, ' times ')
    .replace(/ ÷ /g, ' divided by ')
    .replace(/ = /g, ' equals ')
    .replace(/\b[A-Z]{2,}\b/g, (w) => w.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lines to say, in order. Separate lines rather than one string so a
 *  spelling word keeps its own recorded Cakey clip — the clips are looked up
 *  by exact text, and a joined sentence would never match one. */
export function spokenQuestion(challenge: Challenge): string[] {
  if (challenge.kind === 'numeric') {
    const math = toSpeakable(challenge.prompt);
    return [challenge.verbatim ? `${math}?` : `What is ${math}?`];
  }

  const lines = [challenge.prompt];
  if (challenge.subtext && !SOURCE_LABEL.test(challenge.subtext.trim())) {
    lines.push(challenge.subtext);
  }
  const spoken = lines.map(toSpeakable).filter(Boolean);

  if (challenge.kind === 'steps') {
    const first = challenge.steps[0];
    return first ? [...spoken, ...spokenQuestion(first)] : spoken;
  }
  // The word itself goes last and verbatim: it is the clip lookup key.
  return challenge.speak ? [...spoken, challenge.speak] : spoken;
}
