// Every API route is guarded, or says in writing why it is not.
//
// The capability argument on requireSessionOrJson / requireParentModeOrJson is
// REQUIRED, so a route that calls a guard cannot forget to declare what it
// costs — the compiler asks. This test covers the other half: a route that
// calls no guard at all, which the compiler cannot notice.
//
// That gap is not hypothetical. Before the tier work, twelve routes had no
// guard, and two of them (game-ideas/upload-drawing, feedback/transcribe) were
// taking a kid id from an unsigned cookie and writing to storage with it.
//
// Adding an unguarded route now fails here. Making one public on purpose means
// typing a reason into PUBLIC_ROUTES below, which a reviewer sees.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Routes that legitimately run without a family guard, and why.
 *
 *  Each of these authenticates by some OTHER means, or exists precisely to
 *  serve someone who has no session yet. The reason string is the point: it is
 *  what a reviewer reads when this list grows. */
const PUBLIC_ROUTES: Record<string, string> = {
  'api/auth/login': 'Issues the session. Cannot require one.',
  'api/auth/signup': 'Creates the family. Gated by a single-use invite code instead.',
  'api/auth/logout': 'Ends a session; safe to call without one.',
  'api/ba/unlock': 'The anonymous arcade gate. Shared password, no family exists.',
  'api/kids/clear-stale': "Clears the caller's OWN cookie. Touches no data.",
  'api/kids/select': 'Sets the active-kid cookie; enforces family scope and the kid PIN inline.',
  'api/parent/lock': 'Drops grown-up mode. Same-origin only, and dropping privilege is always safe.',
  'api/parent/unlock': 'The PIN gate itself — requiring grown-up mode here would be circular.',
  'api/parent/tokens/grant':
    'Hand-rolls the same checks inline because it answers in two shapes (JSON panel, 303 form).',
  'api/cron/weekly-digest': 'Bearer CRON_SECRET. Iterates every family by design.',
  'api/cakey-quiz/start': 'Delegates to requireQuizContext in lib/cakey-quiz/server.ts.',
  'api/cakey-quiz/answer': 'Delegates to requireQuizContext in lib/cakey-quiz/server.ts.',
};

const GUARD_CALLS = ['requireSessionOrJson', 'requireParentModeOrJson'];

/** Windows path separator, as a char code.
 *
 *  Written this way because a backslash literal has to survive a shell, a
 *  heredoc and a code generator to reach this file, and twice it did not —
 *  arriving as an unterminated string. A char code cannot be mangled. */
const WIN_SEP = String.fromCharCode(92);

/** Every route.ts under src/app/api, as forward-slash paths.
 *
 *  A hand-rolled walk rather than fs.globSync: that exists at runtime on Node
 *  24 but is not in the @types/node this repo pins, so it type-checks red
 *  while passing green — the worst of both. A dozen lines of readdirSync has
 *  neither problem and adds no dependency. */
function routeFiles(dir = 'src/app/api'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name).split(WIN_SEP).join('/');
    if (entry.isDirectory()) out.push(...routeFiles(path));
    else if (entry.name === 'route.ts') out.push(path);
  }
  return out;
}

/** 'src/app/api/town/state/route.ts' -> 'api/town/state' */
function routeKey(file: string): string {
  return file.replace(/^src\/app\//, '').replace(/\/route\.ts$/, '');
}

describe('every API route is guarded or explicitly public', () => {
  const files = routeFiles();

  it('finds the route files at all', () => {
    // A walk that silently matched nothing would make every assertion below
    // pass vacuously — the exact failure this whole file exists to prevent.
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no unguarded route without a written reason', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const key = routeKey(file);
      const src = readFileSync(file, 'utf8');
      if (GUARD_CALLS.some((g) => src.includes(g))) continue;
      if (PUBLIC_ROUTES[key]) continue;
      offenders.push(key);
    }
    expect(
      offenders,
      "Unguarded API route(s). Use requireSessionOrJson('<capability>') or " +
        "requireParentModeOrJson('<capability>'), or add an entry to " +
        'PUBLIC_ROUTES in this file with the reason it needs none.',
    ).toEqual([]);
  });

  it('has no stale entries in the public allowlist', () => {
    // An allowlist that outlives the route it excused is how a future route at
    // the same path inherits an exemption nobody granted it.
    const keys = new Set(files.map(routeKey));
    const stale = Object.keys(PUBLIC_ROUTES).filter((k) => !keys.has(k));
    expect(stale, 'PUBLIC_ROUTES names routes that no longer exist').toEqual([]);
  });

  it('gives every allowlisted route a real reason', () => {
    for (const [route, reason] of Object.entries(PUBLIC_ROUTES)) {
      expect(reason.length, `${route} needs a real justification`).toBeGreaterThan(20);
    }
  });
});
