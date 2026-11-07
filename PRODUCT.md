# Product

## Register

product

## Platform

web

## Users

Two kids at meaningfully different math and reading levels, playing on an iPad, usually at home, usually by choice rather than by assignment. They are the real users and the reason the thing exists. A grown-up is the secondary user: they check in through `/parent`, log observations, grant Sugar Tokens, and read the tickets kids file. The two audiences want different things from the same data, and the kid side always wins a conflict.

The product is in the middle of opening to other families. That work is real — family isolation, invite codes, per-family configuration — but no other family is using it yet. Design for the kids actually playing it first; just don't hard-code them. Anything founder-specific that a stranger's kid would trip over is debt, not personalization.

## Product Purpose

Gamecakes is a walkable world with games in it. Kids explore an archipelago of themed lands, unlock places with Sugar Tokens they earn by playing, customize a cupcake avatar, ride trains and ferries and rented vehicles between islands, and solve math or reading problems at the gates that stand between them and the next thing they want.

Underneath, an adaptive engine reads every attempt, tracks rolling-window mastery per skill, and moves each kid up or down a difficulty tier without anyone choosing a grade level. The grown-up dashboard turns that into a picture of where a kid actually is.

Success is narrow and hard: **kids choose it themselves.** Not "kids comply," not "kids improve on a chart" — kids open the iPad and pick Gamecakes over the alternatives, unprompted. Everything else is downstream of that. If the practice loop works but nobody reaches for it, the product has failed at the only thing that's difficult.

## Positioning

**A world, not a worksheet.** The town is the product. Games are places you travel to, not items on a list, and the learning is the toll you pay at the gate rather than the thing you came for.

## Brand Personality

Sweet, bouncy, adventurous.

Sweet is literal: the brand is a three-layer cake — strawberry, vanilla, mint, cherry on top — and every surface is confection. Bouncy is physical: things squash when tapped, springs launch you, the cupcake bobs when it walks, and a press should feel like it moved something. Adventurous is structural: there is always somewhere further out to reach — a fogged land, an island across the water, a level you haven't grown yet.

Voice is a friendly grown-up talking to a kid who is smart but seven. Short sentences, real words, no baby talk and no jargon. Never scold, never nag, never guilt. When something goes wrong it is the app's fault, not the kid's. When something goes right, say so and move on — the celebration is a beat, not a ceremony.

## Anti-references

**An edtech worksheet with a skin.** Prodigy, IXL, Khan Kids — where the "game" is a cartoon wrapper stretched over a problem set, and every kid can feel the worksheet underneath within about ninety seconds. The tell is that the game part and the learning part are separable: strip the math and you'd still have a game; strip the game and the math is unchanged.

Gamecakes fails this test the moment a screen would work just as well as a list of problems. The gate mechanic is the guard against it — a math problem is a locked door in a place you are trying to get to, not a slide in a deck.

## Design Principles

**The world is the product; practice is the toll.** Every feature earns its place by making the world worth being in. When a learning goal and the world's coherence conflict, fix the world first and find another way to teach.

**Earn the choice, every session.** Success is defined as kids picking it unprompted, which rules out the entire engagement toolkit that works by obligation. No streaks to protect, no guilt states, no notifications, no timers manufacturing urgency. The pull has to come from wanting to see what's out there.

**Nintendo-grade generosity.** The reference is first-party Nintendo polish: controls readable on sight, hit boxes tuned in the kid's favor, squash-and-stretch on every interaction, and nothing that punishes a kid for being small or slow. Difficulty lives in the puzzle, never in the interface.

**No seams a stranger would trip on.** As the platform opens up, founder-specific defaults are technical debt. Every hard-coded name, land, or assumption about which two kids are playing is a bug waiting for the third family.

**Legible before it is pretty.** Small eyes, a bright screen, often not indoors. Contrast and tap-target size are legibility requirements, not compliance chores — and they outrank the candy aesthetic when the two disagree.

## Accessibility & Inclusion

**WCAG 2.1 AA is the standard, everywhere** — including game chrome and the parent dashboard.

Concretely: 4.5:1 contrast for text (3:1 for genuinely large text), a visible focus indicator on every interactive control, and a 44px minimum tap target per Apple HIG. The tap-target rule is already well enforced via the `--min-tap-target` token; the other two are not, and the July 2026 button audit found every white-on-gradient control failing contrast at its light stop, plus 156 of 158 buttons with no focus indicator. Treat both as open defects.

`prefers-reduced-motion` must have a real alternative on every animation, not a removal — the world should still feel alive when motion is reduced.
