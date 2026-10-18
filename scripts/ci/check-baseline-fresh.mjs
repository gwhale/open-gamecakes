// Fails the build if a migration is added without regenerating the baseline.
//
// WHY THIS EXISTS
//
// supabase/baseline/0001_baseline.sql is the ENTIRE schema for anyone who is
// not the founding deployment. scripts/opensource/publish.mjs deletes
// supabase/migrations/ from the public cut and puts that one file in its place,
// so a fresh self-hosted install runs it and nothing else.
//
// Which means a migration that ships without a baseline regeneration is
// invisible here and broken there. It happened: 0048 and 0049 added
// class_material.modes and .glosses, the code selects both columns, and the
// baseline went out without them — so a stranger's first visit to the parent
// skills tab was a 500. Nobody on this side could have noticed, because this
// side has the columns.
//
// The failure mode is the problem, not the mistake. There is no local symptom
// at all, and the person who finds it is someone who just cloned the repo and
// concluded it does not work.
//
// WHAT IT CHECKS
//
// Against the merge base with origin/master: if this branch touches anything in
// supabase/migrations/, it must also touch supabase/baseline/0001_baseline.sql.
// That is all. It does not verify the baseline is CORRECT — only that someone
// regenerated it, which is the step that actually gets skipped.
//
// Regenerating (see docs/UPDATING.md):
//
//   node scripts/opensource/baseline.mjs generate <project-ref> \
//     > supabase/baseline/0001_baseline.sql
//
// Apply the migration by hand in the SQL editor FIRST — the baseline is
// generated from the live schema, not by concatenating migration files.
//
// Usage:  node scripts/ci/check-baseline-fresh.mjs   (npm run check:baseline)
// Exit 0 = clean or nothing to check, 1 = a migration shipped without it.

import { execFileSync } from 'node:child_process';

const MIGRATIONS = 'supabase/migrations/';
const BASELINE = 'supabase/baseline/0001_baseline.sql';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** Same, but WITHOUT trimming. `git status --porcelain` encodes state in the
 *  first two columns, so ' M path' has a meaningful leading space — and a
 *  global .trim() eats it on the first line only, which then shifts that one
 *  path left by a character. It read as "the check just doesn't work" until
 *  the passing case was tested as deliberately as the failing one. */
function gitRaw(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/** The commit this branch diverged from. Falls back to origin/master itself so
 *  a shallow CI checkout without full history still compares against
 *  something sensible rather than exploding. */
function mergeBase() {
  for (const ref of ['origin/master', 'master']) {
    try {
      return git(['merge-base', 'HEAD', ref]);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const base = mergeBase();
if (!base) {
  // No comparable history — a fresh clone, or a fork without our master.
  // Silence is right: there is nothing to diff against, and failing here would
  // block someone whose only mistake was cloning shallowly.
  console.log('baseline freshness: no merge base to compare against, skipping');
  process.exit(0);
}

// Committed work AND the working tree. CI only ever sees the former, but a
// check that stays silent until you push is one you learn about from a red
// build rather than from running it. Counting uncommitted migrations too means
// you find out while the fix is still one command.
const LF = String.fromCharCode(10);

const committed = git(['diff', '--name-only', base + '...HEAD'])
  .split(LF)
  .filter(Boolean);

// --porcelain lines are 'XY path'. The rename form is 'R  old -> new'; take the
// destination, which is the file that now exists.
const working = gitRaw(['status', '--porcelain'])
  .split(LF)
  .filter(Boolean)
  .map((line) => {
    const p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    return arrow >= 0 ? p.slice(arrow + 4) : p;
  });

const changed = [...new Set([...committed, ...working])];

const migrations = changed.filter((f) => f.startsWith(MIGRATIONS));
if (migrations.length === 0) {
  console.log('baseline freshness: no migrations touched, nothing to check');
  process.exit(0);
}

if (changed.includes(BASELINE)) {
  console.log(
    `baseline freshness: clean (${migrations.length} migration(s), baseline regenerated)`,
  );
  process.exit(0);
}

const NL = String.fromCharCode(10);
console.error(
  NL +
    'baseline freshness FAILED' +
    NL +
    NL +
    '  These migrations are in this branch:' +
    NL +
    migrations.map((m) => `    ${m}`).join(NL) +
    NL +
    NL +
    `  ...but ${BASELINE} is unchanged.` +
    NL +
    NL +
    '  That file is the whole schema for anyone who is not this deployment:' +
    NL +
    '  publish.mjs replaces supabase/migrations/ with it in the public cut. A' +
    NL +
    '  migration that ships without it is invisible here and broken there.' +
    NL +
    NL +
    '  Apply the migration by hand in the SQL editor, then:' +
    NL +
    NL +
    '    node scripts/opensource/baseline.mjs generate <project-ref> \\' +
    NL +
    `      > ${BASELINE}` +
    NL +
    NL +
    '  If this migration genuinely does not change the schema (a comment, a' +
    NL +
    '  data-only backfill), regenerate anyway — the diff will be empty and the' +
    NL +
    '  check passes.' +
    NL,
);
process.exit(1);
