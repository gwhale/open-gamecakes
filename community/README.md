# Your kid's own land, and the games in it

The most fun thing you can do with this codebase is build a game with your kid
and put it somewhere in the town that belongs to them. This directory explains
how, and why upstream ships none of them.

## Why there is nothing here but this file

The family who wrote Gamecakes has two of these — a land each, with a game each
built alongside the kid it belongs to. They are not in this repository, and
that is deliberate rather than an oversight.

They are **rough**. They were built fast, with a child watching, to be finished
that afternoon. They are held to a lower bar than the games in
`src/app/(gated)/games/`, on purpose, because the point was the building.

They are **specific**. A per-kid land is a place named for and themed around
one child. Shipping ours would seed your town with a kid you have never met.

So they live in two files that upstream never touches, and your copy of those
files starts empty:

| File | Holds |
|---|---|
| `src/lib/games/registry.local.ts` | your deployment's own games |
| `src/lib/town/regions.local.ts` | your deployment's own per-kid lands |

That is the whole seam. `git merge upstream/main` will never touch either file,
because upstream only ever edits `registry.ts` and `regions.ts` — different
files, so a release that adds a game and a family that adds a game are not the
same edit and cannot conflict.

## Adding a game

1. **Build it** under `src/app/(gated)/games/<your-slug>/`. Upstream does not
   know that directory exists, so nothing in it can conflict either. Copy the
   closest existing game as a starting point; `docs/creating-a-new-game.md` has
   the shape.

2. **Register it** in `src/lib/games/registry.local.ts`. The slug must match the
   directory name.

   ```ts
   export const LOCAL_GAMES: readonly GameInfo[] = [
     { slug: 'rocket-fractions', label: 'Rocket Fractions', glyph: '🚀',
       subject: 'math', wordsMode: false },
   ];
   ```

3. **Place it** in a region, or the town has a game nobody can walk to. Either
   add the slug to a region's `games` array in `regions.ts`, or — better — put
   it on your own kid's land, below.

A duplicate slug throws in development rather than silently shadowing an
upstream game. That check is there because "build a game with your kid" is the
single most likely merge conflict in the project, and a collision that only
shows up as a wrong game loading is much worse than a startup error.

## Adding a kid's land

Add it to `src/lib/town/regions.local.ts`. The file has a worked example in a
comment; the rules that matter:

- **Pick free tiles.** The world is 16×17 and upstream's rects are laid out in
  `regions.ts`. Read it first — overlapping rects are not detected.
- **`kidLand: true`, `starter: true`, `unlock_cost: 0`.** A kid's own land
  should always be reachable, with no fog and nothing to buy.
- **Name a neighbour that exists upstream**, or the land cannot be reached on
  foot. `neighbors` runs one-directionally, from your land outward.
- **Local regions are appended last**, so `REGIONS[0]` stays Town Square — the
  default spawn.

## Ownership is data, not a name in a file

Which kid owns which land is a column, `kids.land_slug`, not a string in the
source. Set it and the town renders that kid's own customised cupcake as the
land's centre landmark instead of the generic icon.

That is why you will not find a child's name anywhere in this repository, and
why `npm run check:names` fails the build if one appears. Name your slug for
the game or the place, not the kid — `treehouse-land`, not `sams-land`. The
child's name belongs in the database row, where it is theirs and stays private.

## Sharing one back

If you build something good and generic — a game that any family could use,
with no name or in-joke baked in — that is exactly what upstream wants. Move it
from `registry.local.ts` to `registry.ts`, place it in a shared region rather
than a kid land, and open a pull request. `CONTRIBUTING.md` covers the rest.

Keep the rough, specific, made-with-your-kid ones for yourself. They are better
that way.
