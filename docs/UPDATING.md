# Staying up to date without losing your family's stuff

The short answer: **your kids' data is not in the code.** Pulling an update
cannot touch it, because it lives in a database only you can reach. What *can*
conflict is code you have edited yourself — and there is a way to arrange that
so it almost never does.

## What an update can and cannot reach

| Your family's data — a merge never touches any of this | Where it lives |
|---|---|
| Kids, names, avatars, grades, PINs | `kids` |
| Which land each kid owns | `kids.land_slug` |
| Sugar Token balances and the whole ledger | `kid_tokens`, `token_transactions` |
| Every attempt, tier and mastery figure | `attempts`, `kid_skills`, `evidence_*` |
| Tickets your kids filed, and the replies | `feedback` |
| Regions discovered, cupcake customisations | `kid_region_discoveries`, `kids.cupcake_config` |

All of it is rows in **your** Supabase project. `git merge` does not have an
opinion about rows. This is not luck: family content was deliberately moved out
of the code and into the database precisely so that upstream and your household
could evolve independently.

## What can conflict

Three files hold content rather than mechanism, so they are the ones both you
and upstream are likely to edit:

| File | Holds |
|---|---|
| `src/lib/games/registry.ts` | the game list (`GAME_REGISTRY`) |
| `src/lib/town/regions.ts` | the town's regions and their layout |
| `src/lib/whats-new.ts` | the changelog your kids read |

If you never touch these, updating is a fast-forward and you will never see a
conflict. If you add your own game, you edit the first two — and so does
upstream, every time a game is added there.

## Updating

Your copy is a fork, so it may already know where it came from. If
`git remote -v` does not list an `upstream`, add it once:

```bash
git remote add upstream https://github.com/gwhale/open-gamecakes.git
```

Then whenever you want the latest:

```bash
git fetch upstream
git merge upstream/main

npx supabase db push     # apply any new migrations
node scripts/setup.mjs   # confirms the schema is what the code expects
npm run dev
```

`setup.mjs` is the check worth running after every update. It verifies the
schema, the skills catalog and the buckets, and tells you what to do if
something is missing rather than failing obscurely later.

## Keeping your own games out of the way

If you add games, keep them in files upstream will never edit:

- **Put the game itself in its own directory.** `src/app/(gated)/games/<your-game>/`
  and `src/lib/games/phaser/scenes/<YourGame>Scene.ts` are yours alone. Nothing
  upstream will ever touch a path it does not know about.
- **Append, never insert.** When you add an entry to `GAME_REGISTRY`, put it at
  the *end* of the array. Git resolves two people appending to different ends of
  a list far more cleanly than two people editing the middle.
- **Keep your changelog entries separate in spirit.** `whats-new.ts` is the
  founding deployment's story upstream and your kids' story locally; expect to
  keep yours and drop theirs when they conflict.

A conflict in `registry.ts` is not dangerous, just tedious — both sides are
adding items to a list, and the resolution is nearly always "keep both."

## Database migrations

Migrations are numbered from **0046**. Everything before that is folded into
`supabase/migrations/0001_baseline.sql`, which is what your install ran on day
one.

There are two lineages in the world — a fresh install built from the baseline,
and a deployment that has been upgraded step by step — and every migration must
land identically on both. If you write one, prove it rather than assume it:

```bash
node scripts/opensource/baseline.mjs fingerprint <projectA> > a.txt
node scripts/opensource/baseline.mjs fingerprint <projectB> > b.txt
diff a.txt b.txt
```

Apply your migration to one project first and check the diff is **non-empty**
before applying it to the other. A check that is always green proves nothing;
watching it go red and then green is what makes the second result mean
something.

The fingerprint covers columns, types, defaults, constraints, indexes, function
bodies, triggers, RLS policies, storage buckets and table privileges. That last
one is there because a baseline once reproduced every structural detail
perfectly and still produced a database the application could not read.

## Working on it with an AI assistant

This codebase is unusually easy to hand to an AI pair, and that is deliberate —
`CLAUDE.md`, `AGENTS.md`, `docs/creating-a-new-game.md` and a lot of dense
"why this is not what it looks like" comments exist for exactly that.

Two agents ship in `.claude/agents/`:

- **`gamecakes-creative-director`** — how things should look. Point your
  assistant at it before changing the town's appearance.
- **`gamecakes-three-engineer`** — how the 3D is built: the host/engine
  contract, disposal, tablet frame rate, and this codebase's specific traps.

Both are grounded in the real stack — raw imperative `three`, no
React-Three-Fiber, no physics engine, no asset pipeline — so neither suggests
rewriting into something the project deliberately isn't.

Before touching the router, read `AGENTS.md`. Next.js 16 differs from what most
models have memorised, and the docs shipped inside `node_modules/next/dist/docs/`
are the authority.
