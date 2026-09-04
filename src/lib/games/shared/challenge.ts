// Unified Challenge type used across all Gamecakes game scenes.
//
// Discriminated union: every challenge carries a `kind` that tells the
// renderer which UI to show in the shared host modal — a numeric keypad
// for math or a choice-button row for reading.
//
// Scenes emit a Challenge in the 'challenge:open' event; the host reads
// the `kind` and picks the right UI without any per-scene knowledge of
// the subject. Adding a new challenge kind later (drag-order, speech)
// means: add a new variant here + handle it in the host modal once; no
// scene has to change unless it wants to use the new kind.

/** Math challenge — prompt like "7 + 4 = ?" with a numeric answer.
 *  Rendered with the existing 0-9 keypad UI in the host. */
export interface NumericChallenge {
  kind: 'numeric';
  /** Human-readable prompt like "5 + 6" (no "= ?" suffix — host adds it,
   *  unless `verbatim` is set). */
  prompt: string;
  answer: number;
  /** When true, `prompt` is already a complete equation (e.g. the
   *  fill-in-the-blank "7 + ❓ = 10") and the host renders it as-is
   *  instead of appending " = ?". */
  verbatim?: boolean;
}

/** A shape divided into equal parts, drawn as inline SVG by ChallengeInput.
 *
 *  This is deliberately a tiny declarative spec rather than a new challenge
 *  `kind`. Fractions, partitioning and area are all "here is a shape, some of
 *  it is filled in" — so they reuse the choice-button stack, every host modal,
 *  and the existing crediting path. A new kind would have meant touching every
 *  scene again for no extra expressiveness.
 *
 *  Covers 1.G.A.3 and 2.G.A.3 (partition into halves, thirds, fourths),
 *  3.NF.A.1 and 3.NF.A.3 (a/b built from unit fractions, and comparing two
 *  wholes side by side), 2.G.A.2 and 3.MD.C.5/C.7 (rows and columns of unit
 *  squares, and area as covering). */
export interface Figure {
  /** 'circle' and 'bar' divide one whole into `total` equal parts. 'grid'
   *  draws `rows` × `total` unit squares — the shape area and arrays are
   *  taught with. */
  shape: 'circle' | 'bar' | 'grid';
  /** Equal parts in the whole (grid: columns). */
  total: number;
  /** How many of them are filled. */
  shaded: number;
  /** grid only. Ignored by circle and bar. */
  rows?: number;
  /** Small caption under this figure, e.g. "A" and "B" when comparing two. */
  label?: string;
}

/** Reading challenge — a short prompt + 2-4 choice buttons.
 *  Rendered as a vertical button stack in the host modal. */
export interface ChoiceChallenge {
  kind: 'choice';
  /** Short instruction, e.g. "Which word rhymes with CAT?" */
  prompt: string;
  /** Optional subtext shown smaller below the prompt — for longer
   *  context like a cloze sentence. */
  subtext?: string;
  /** The correct choice text (must exactly match one entry in `choices`). */
  answer: string;
  /** Shuffled choice list, length 2–4. The host renders one button each. */
  choices: string[];
  /** Say this aloud when the question opens, with a replay button beside the
   *  prompt. For spelling, the word MUST NOT also appear in `prompt` — hearing
   *  it is the question. Cakey speaks it if a clip exists, otherwise the
   *  browser voice does; see lib/town/cakey-voice.ts. */
  speak?: string;
  /** One or two shapes drawn above the choices. Two means "compare these". */
  figures?: Figure[];
}

export type Challenge = NumericChallenge | ChoiceChallenge;

/** Convenience narrowers for scenes/hosts that need to branch. */
export function isNumeric(c: Challenge): c is NumericChallenge {
  return c.kind === 'numeric';
}
export function isChoice(c: Challenge): c is ChoiceChallenge {
  return c.kind === 'choice';
}
