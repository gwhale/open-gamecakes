# Contributing

Gamecakes is a learning game two kids actually play. That shapes what gets
merged: changes are judged by whether a child has a better time, not by whether
the code is clever.

If you are here to run it for your own family, you want
[SELF_HOSTING.md](SELF_HOSTING.md) instead. Nothing here is required to use it.

## What belongs upstream, and what belongs in your fork

**Upstream** — anything another family benefits from:

- New games, and improvements to existing ones
- Engine and platform fixes: the town, the token economy, the adaptive
  difficulty, the parent dashboard
- Accessibility, performance, and anything that makes setup less painful
- Documentation, especially where it was wrong or missing

**Your fork** — anything specific to your household:

- Your kids' names, grades, avatars, lands
- Content pitched at your children in particular
- Your deployment's What's New entries

The dividing line: if it would be strange in a stranger's copy, it is family
content. Family content lives in your database, never in the code — that
separation is deliberate and hard-won.

## Getting set up

Follow [SELF_HOSTING.md](SELF_HOSTING.md). You need a working install to
develop against; there is no mock mode.

Before opening a PR:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run check:names
```

CI runs those plus a production build using placeholder credentials. It needs
no secrets, so a PR from a fork gets the full set of checks.

## Adding a game

Read [`docs/creating-a-new-game.md`](docs/creating-a-new-game.md) first — it is
the canonical guide and it is kept current.

The review bar:

- A registry entry in `src/lib/games/registry.ts` and a placement in the town.
  A game that cannot be reached is not shipped.
- **Tests for the pure logic** — scoring, difficulty curves, question
  selection. Not the rendering; the parts where being wrong is invisible.
- An entry in `src/lib/whats-new.ts`. A ship is not done without one; this
  rotted across roughly ten releases before it became a rule.
- Played on a touch device. Most play happens on a tablet, and a game that
  feels right with a mouse can be unplayable with a thumb.

Games are Phaser 3 or hand-written Three.js. There is no React-Three-Fiber and
no physics engine — see `AGENTS.md` and the existing scenes before reaching for
a dependency.

## Touching the database

Migrations live in `supabase/migrations/`. `0001_baseline.sql` builds the whole
schema; **new migrations are numbered from 0046.**

Two rules, both learned the hard way:

1. **A migration must apply to both lineages** — a fresh install built from the
   baseline, and a long-running deployment that has been upgraded step by step.
   Verify it rather than assuming:

   ```bash
   node scripts/opensource/baseline.mjs fingerprint <projectA> > a.txt
   node scripts/opensource/baseline.mjs fingerprint <projectB> > b.txt
   diff a.txt b.txt
   ```

   Apply your migration to one first and confirm the diff is **non-empty**
   before applying it to the other. An always-identical check proves nothing.

2. **No family-specific backfills.** Never `where name = 'Somebody'`. Seed data
   in a migration is content every install receives, so it must make sense for
   a family you have never met.

Also: the migration folder is not proof of anything. Whether a column exists is
a fact about the database, not about the files. Check the database.

## Working with an AI assistant

This codebase is built to be handed to one. `CLAUDE.md` and `AGENTS.md` set the
ground rules, `docs/creating-a-new-game.md` is the canonical build guide, and
the dense "why the obvious approach is wrong here" comments exist so a fresh
session has working context on day one.

Two agents ship in `.claude/agents/`, and they split along the line you would
expect:

- **`gamecakes-creative-director`** — how the town and its games should *look*.
  Terrain, lands, booths, signs, lighting, materials, motion. Grounded in the
  real palette and characters, so you get file-anchored art decisions rather
  than generic whimsy.
- **`gamecakes-three-engineer`** — how the 3D is *built*. The host/engine
  contract, disposal, frame rate on a tablet, and the traps particular to this
  codebase. Use it when writing an engine, chasing a leak between rounds, or
  reviewing 3D code.

Both know the actual stack — raw imperative `three`, no React-Three-Fiber, no
physics engine, no asset pipeline — so neither will suggest a rewrite into
something this project deliberately isn't.

Keeping your own copy up to date without losing your family's data is covered
in [docs/UPDATING.md](docs/UPDATING.md).

## Style

Match the file you are editing. Comments explain *why*, especially where the
obvious approach is wrong — that convention is why this codebase is workable
with an AI assistant, and it is worth keeping.

`npm run check:names` enforces that no real child's name appears anywhere in
this repository — prose or identifier. It used to be case-sensitive, tolerating
a lowercase slug as a legacy identifier while catching the capitalised form in
a sentence. That distinction is gone: the games and lands that carried those
slugs were a family's own, and they now live in the `.local` seams that
upstream never ships (see `community/README.md`).

So the rule is simply: not at all, in any case. If you are contributing a game
built with your own kid, name the slug for the game rather than the child, and
keep it in `registry.local.ts`.

## Reporting bugs

Say what your kid was doing, what happened, and what you expected. Their age and
the device matter more than a stack trace — most bugs here are about a game
feeling wrong, not throwing.
