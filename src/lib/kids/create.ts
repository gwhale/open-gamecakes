// Validating a new kid — a handle and a grade, and deliberately nothing else.
//
// WHAT THIS FILE IS ACTUALLY FOR
//
// This deployment can be signed up for by a stranger. Holding identifiable
// information about someone else's child is the thing the project decided not
// to do (docs/open-source-prd.md: "hosting other families' children's data
// creates custodial obligations"), and a self-serve tier only stays on the
// right side of that line if the shape of the data keeps it there.
//
// So the field is a HANDLE, not a name. One word, no spaces.
//
// BE HONEST ABOUT WHAT THAT DOES AND DOES NOT DO
//
// It cannot stop a parent typing their child's real first name. Nothing can.
// What it does is:
//
//   * make the natural thing to type a nickname rather than a name — "one
//     word, no spaces" rules out `Anna Smith` structurally, and is a rule a
//     seven-year-old can follow;
//   * collect nothing else, so a first name on its own is not identifying;
//   * offer a rename (PATCH), so a mistake is fixable;
//   * and refuse, forever, to add the field that would make it matter.
//
// DO NOT add a "last name", a birthday, or a photo to this form. Each is
// individually reasonable and collectively the thing we said we would not do.
//
// A "does this look like a real name?" validator was considered and rejected:
// it is unreliable, it would reject legitimate handles, and it would create a
// false impression of enforcement. The structural rule does the real work.

import { GRADE_LABELS } from './grade';

export type HandleError =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'has_space'
  | 'bad_chars'
  | 'reserved';

/** Handles that would collide with something the app already means. */
const RESERVED = new Set([
  'guest',
  'admin',
  'parent',
  'grownup',
  'grown-up',
  'cakey',
  'gamecakes',
  'new',
  'me',
]);

export const HANDLE_MIN = 2;
export const HANDLE_MAX = 16;

/** Letters, digits, underscore and hyphen; must start with a letter or digit.
 *  No spaces — that is the rule doing the work, see the header. */
const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Collapse whitespace and trim. Case is PRESERVED — a kid who types "Zoomer"
 *  should see "Zoomer", not "zoomer". Only the uniqueness check is
 *  case-insensitive. */
export function normalizeHandle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function validateHandle(raw: string): HandleError | null {
  const handle = normalizeHandle(raw);
  if (!handle) return 'empty';
  // Checked before the character class so the message can be specific: "no
  // spaces" is actionable, "bad characters" is not.
  if (/\s/.test(handle)) return 'has_space';
  if (handle.length < HANDLE_MIN) return 'too_short';
  if (handle.length > HANDLE_MAX) return 'too_long';
  if (!HANDLE_RE.test(handle)) return 'bad_chars';
  if (RESERVED.has(handle.toLocaleLowerCase())) return 'reserved';
  return null;
}

/** Kid-facing wording for each failure. Says what to do, not what went wrong. */
export const HANDLE_MESSAGES: Record<HandleError, string> = {
  empty: 'Pick a name for this player.',
  too_short: `Use at least ${HANDLE_MIN} characters.`,
  too_long: `Keep it to ${HANDLE_MAX} characters or fewer.`,
  has_space: 'One word, no spaces — a nickname works well.',
  bad_chars: 'Letters, numbers, - and _ only, starting with a letter or number.',
  reserved: 'That one is taken by the app. Try another.',
};

/** Grade from a form value. K is 0.
 *
 *  Returns null for anything unrecognised, and null is a VALID stored value —
 *  a kid with no grade set simply gets the middle-of-range defaults. So this
 *  never throws and never blocks the insert. */
export function parseGrade(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const index = GRADE_LABELS.indexOf(trimmed.toUpperCase() as (typeof GRADE_LABELS)[number]);
  return index >= 0 ? index : null;
}

/** Is this handle already used in this family? Case-insensitive, because two
 *  kids called "Sam" and "sam" on one tablet is a UX problem even though the
 *  database would happily hold both. */
export function handleTaken(handle: string, existing: readonly string[]): boolean {
  const wanted = normalizeHandle(handle).toLocaleLowerCase();
  return existing.some((n) => n.trim().toLocaleLowerCase() === wanted);
}
