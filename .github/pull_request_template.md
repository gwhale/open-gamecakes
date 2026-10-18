<!--
Thanks for contributing. CI runs lint, typecheck, tests, the founder-name check
and a production build with placeholder credentials -- no secrets needed, so
your PR gets the full set of checks from a fork.
-->

## What this changes

<!-- One or two sentences. What is different for a kid or a parent using it? -->

## Why

<!-- The problem, not the patch. If it fixes an issue, link it. -->

## Checklist

- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` pass locally
- [ ] Playtested on a touch device if it changes anything a kid touches

**If you added a game:**

- [ ] Registry entry in `src/lib/games/registry.ts` and a placement in the town
- [ ] Tests for the pure logic (scoring, difficulty, question selection)
- [ ] `src/lib/whats-new.ts` entry — a ship is not done without one
- [ ] Read `docs/creating-a-new-game.md` first; it is the canonical guide

**If you touched the database:**

- [ ] Migration numbered from 0045 and applies to BOTH lineages: the founding
      deployment, and a fresh install built from `supabase/baseline/0001_baseline.sql`
- [ ] Verified with `scripts/opensource/baseline.mjs fingerprint` on each and a
      diff, not by assuming
- [ ] No `where name = '...'` backfills — family-specific data belongs in a
      family's own database, never in a migration

**If you touched the 3D town:**

- [ ] Disposed geometries, materials and textures on teardown
- [ ] Checked frame rate on a tablet, not just a laptop
