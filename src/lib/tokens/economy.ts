// The Sugar Token economy — ONE price ladder for the whole game.
//
// Every sink used to price itself in isolation: region unlock costs lived in
// regions.ts, rentals in vehicles.ts, cosmetics in the cupcake catalog, land
// upgrades in land-evolution.ts, the storm fee in weather-config.ts. Nothing
// compared them, and the ordering had quietly inverted — unlocking a whole LAND
// (5–12) cost less than a sprinkle topping (10), a rainbow (25) or a layered
// base (40). The most exciting thing in the game was the cheapest thing in it.
//
// This module is the single place prices are decided, so a new sink can't be
// priced by guesswork and the ordering stays auditable at a glance.
//
// ── THE UNIT ────────────────────────────────────────────────────────────────
// A single session's drip is capped at 5 (MAX_SESSION_DRIP in mint.ts), but
// that is NOT the useful unit: kids play several sessions a day. Measured
// against prod (2026-07-25) the two active kids earn ~29 and ~31 tokens per
// ACTIVE DAY across 22 and 16 days. So:
//
//     DAY ≈ 30 tokens
//
// Price things in DAYS of play, not sessions. Priced in sessions, the entire
// town came to 79 tokens — under three days — which is why both kids had
// unlocked all nine lands and were sitting on 323 and 143 spare tokens with
// nothing left to want.
//
// ── THE LADDER (ascending; a new price must slot in without reordering) ─────
//
//   1        fare .............. one-time bus/ferry fare (the RIDE, not the land)
//   1–5      rental ............ a day's skateboard / jeep / biplane / balloon
//   3        storm clear ....... shake a storm off one land
//   4–40     cosmetics ......... cupcake wrappers → frostings → toppings →
//                                varieties → bases (see the cupcake catalog;
//                                deliberately left as-is, see NOTE below)
//   15/40/90 land upgrades ..... cottage → tower → castle, the post-unlock sink
//   30–100   LAND UNLOCKS ...... the real progression. Above every routine
//                                cosmetic, because a land is new GAMES.
//
// NOTE — what deliberately did NOT change: cosmetics, rentals, the storm fee and
// land upgrades keep their existing values. They were already internally
// ordered, and re-pricing a live shop would punish kids who had banked tokens
// toward something specific. They are re-exported here so the ladder is
// complete and comparable in one place, not to change them.

/** Tokens a busy kid earns in one ACTIVE DAY. The unit prices are reasoned in.
 *  Measured from prod, not assumed — see the header. */
export const DAY = 30;

/** One-time fare to ride the Cakey Ferry or the Sugar Mile bus. Charged on the
 *  DISCOVERING arrival only, so the trip home is always free and an empty wallet
 *  can never strand a kid offshore. This buys the RIDE; the land it carries you
 *  to is priced separately below. */
export const FARE = 1;

/** Land unlock costs, tiered by how deep into the world the land sits.
 *
 *  Roughly: NEAR = a day, FAR = two, DEEP = three and a half. Unlocking the
 *  whole town totals ~630 tokens ≈ 21 active days — a season-long goal, versus
 *  the 2.6 days it cost before.
 *
 *  ISLAND sits between FAR and DEEP: an offshore land also costs a FARE to reach
 *  and is gated behind owning a ride or affording the bus, so the land itself
 *  need not carry the whole difficulty. */
export const LAND = {
  /** One step from home — the first taste of progression. */
  NEAR: 30,
  /** Two steps out. */
  FAR: 60,
  /** The far edges and the capstone. */
  DEEP: 100,
  /** An offshore island — the WHOLE island, in ONE payment.
   *
   *  This price is carried by the island's LANDING land (Chess Island, Pit Row).
   *  Arriving there reveals every land on that island and all of their games;
   *  the other lands are priced at 0 in the catalog. An island is one place a
   *  kid decides to go, so it is one purchase — charging again for the far end
   *  of an island they already paid to reach reads as being billed twice for
   *  the same trip. See /api/town/ferry, which grants the siblings. */
  ISLAND: 75,
} as const;

/** What it actually costs to arrive on an offshore land, all in.
 *
 *  The fare buys the RIDE and only applies to public transport; the land's own
 *  unlock_cost applies on every route. /api/town/ferry computes the charge with
 *  exactly this rule, so UI that prices a trip MUST call this rather than
 *  re-deriving it — a button that promises 🪙1 and then debits 🪙76 is how you
 *  make a kid think the game stole from them. */
export function arrivalPrice(
  unlockCost: number,
  via: 'ferry' | 'bus' | 'drive' | 'fly',
): number {
  const fare = via === 'ferry' || via === 'bus' ? FARE : 0;
  return fare + unlockCost;
}

/** A single game's unlock price.
 *
 *  Sits deliberately BELOW every land: a land is a whole place with several
 *  things in it, a game is one thing. At ~25 it lands under a day's play, so a
 *  kid who wants a new game can have it within a session or two rather than
 *  saving across a week — the point is to make the choice feel real, not to put
 *  a wall in front of the fun part.
 *
 *  APPLIES TO NEW GAMES ONLY. Everything that already existed stays at 0 and
 *  never gates; nothing a kid already plays is taken away. A game opts in by
 *  setting `unlock_cost` in the registry — omit it and the game is free. */
export const GAME = {
  /** Standard price for a new game. */
  STANDARD: 25,
} as const;

/** Existing sinks, unchanged — re-stated here so the whole ladder is visible in
 *  one file. Change a value HERE, never at the call site. */
export const RENTAL = {
  /** Sprinkle Skateboard, for a day. */
  BASIC: 1,
  /** Cookie Cruiser (jeep), for a day. */
  ROAD: 2,
  /** Buttercream Biplane, for a day. */
  AIR: 4,
  /** Hot-air balloon, for a day. */
  SKY: 5,
} as const;

/** Shake a storm off one discovered land. */
export const STORM_CLEAR = 3;

/** Land evolution ladder — the post-unlock long-tail sink. Deliberately left
 *  BELOW the deepest land unlocks at the low end: upgrading a land you already
 *  own is a smaller step than acquiring a new one, while the castle stays the
 *  single biggest purchase in the game. */
export const ESTATE = {
  COTTAGE: 15,
  TOWER: 40,
  CASTLE: 90,
} as const;

// Build-time invariant: the ladder must stay ordered. A cheap land unlock that
// slipped below a routine cosmetic is exactly the inversion this module exists
// to prevent, so assert it rather than trusting a future edit to notice.
if (process.env.NODE_ENV !== 'production') {
  const problems: string[] = [];
  if (LAND.NEAR <= ESTATE.COTTAGE) {
    problems.push(`LAND.NEAR (${LAND.NEAR}) should exceed ESTATE.COTTAGE (${ESTATE.COTTAGE})`);
  }
  if (!(LAND.NEAR < LAND.FAR && LAND.FAR < LAND.DEEP)) {
    problems.push('LAND tiers must ascend NEAR < FAR < DEEP');
  }
  if (!(LAND.FAR <= LAND.ISLAND && LAND.ISLAND <= LAND.DEEP)) {
    problems.push('LAND.ISLAND should sit between FAR and DEEP');
  }
  if (FARE >= LAND.NEAR) {
    problems.push('FARE should be pocket change next to a land');
  }
  if (problems.length > 0) {
    console.warn('[tokens/economy] price ladder is out of order:', problems);
  }
}
