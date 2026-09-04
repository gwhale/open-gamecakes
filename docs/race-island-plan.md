# Race Car Island — build plan

**Goal:** a third landmass in the Gamecakes archipelago, themed around racing, reached by a
**road bridge you cannot walk** — you cross it **in a vehicle**, or you **pay 1 Sugar Token to ride
the bus** — sitting **about as far offshore as Chess Island** but in a **different direction**, and
**4× Chess Island's size**.

Written 2026-07-25 against `master`-ish (`b01f334` Phase 0c). All numbers below are computed
from the real layout code, not eyeballed.

> **STATUS: SHIPPED** — PR #210, squash-merged to `master` and deployed 2026-07-25.
> Migration `0035_bus_ride.sql` applied to prod (the production project) and verified by invoking
> the new RPC, not merely by checking it exists.
>
> Kept as the reasoning record. Where the shipped result differs from the original plan, the
> section says so inline. Measured outcomes, from running the real solver + bean math:
>
> | Metric | Planned | **Shipped** |
> |---|---|---|
> | Race ÷ Chess area | 4.0× | **4.146×** |
> | Open-water crossing | ≈ Chess | **1,235px** (Chess: 1,393px) |
> | Bearing separation from Chess | "different area" | **113.6°** |
> | Deck length | — | **1,535px** (~7s on foot) |
> | Deck ends on solid ground | required | **nd 0.950 / 0.752** ✓ |
> | Boom stops walker on land | required | **nd 0.981** ✓ |
>
> **Not built:** games for either land (§6 Phase 4) — both shipped scenic. And it is
> **un-playtested on a real iPad** (§8).

---

## 1. What the current code actually constrains

| Fact | Where | Consequence for this plan |
|---|---|---|
| Island placement is an **auto-solver**, not hand-picked offsets | `src/lib/town/islands.ts` | Adding an island = one `ISLANDS` entry. Distance is solved, not authored. |
| `SEA_GAP = TILE_SIZE_PX * 8` (512px) spaces every island's *walk-block* boundary | `islands.ts:32` | Reusing the default gap ⇒ "about as far as Chess" automatically. |
| Island size derives from member regions' **spread** bbox | `layout-core.ts:45` `islandExtentPx` | Size is set by tile-rect dims + region count. There is no size multiplier. |
| `TOWN_SPREAD = 7.6` amplifies original-space distance | `layout-core.ts:9` | Two *adjacent* regions land ~1,950 city-px apart. Multi-region islands get big fast. |
| `ZONE_SCALE = 2.2`, `MARGIN_PX = 128`, `BEACH_PX = 80` | `layout-core.ts:12,15`, `bean.ts:8` | Half-extent = `70.4 × tiles + 128`. |
| Bean radii `rx = (halfW·pad·stretch + 80)·wob·fat`, `ry = (halfH·pad + 80)·wob` | `bean.ts:14` | `wob`/`fat` are angle-only ⇒ **area ratio between two islands = ratio of `rx·ry` base terms.** |
| `autoFitPad` starts at 1.1 and only grows if a rect corner exceeds `nd 0.9` | `bean.ts:62` | Both Chess and the proposed race island stay at **pad 1.1** (verified: max corner `nd` 0.88). |
| Pier decks stay walkable past the sea gate | `engine.ts:1006` + gate at `engine.ts:2330` | **This is the bridge primitive.** |
| Walk-up unlock needs `isAdjacentToDiscovered` + within `FOG_APPROACH_PX` (80) of the rect | `engine.ts:2381`, `types.ts:63` | Not used here — the bus/vehicle gate replaces walk-up. `neighbors: []` like Chess. |
| Vehicles are `control: 'drive'` (skateboard 1🪙, jeep 2🪙) or `'fly'` (biplane, balloon); **drive rides obey the same `avatarBlockedAt` walls as the cupcake** | `vehicles.ts:24`, `engine.ts:1262` | "Vehicles may cross" = one `control === 'drive'` check in the sea-gate exemption. Fly rides already ignore ground collision. |
| Rentals are **all-day, charged once per UTC day**, and are *owned* (`kid_vehicle_rentals` row + expiry) | `0029_kid_vehicle_rentals.sql` | **The bus is none of this** — see the next row. |
| The ferry is a **paid, glued, point-to-point ride** with a state machine + arrival latch — town furniture, not a possession | `ferry.ts`, `engine.ts:1370` | **This is the bus, exactly.** A ferry that drives on tarmac. |
| `/api/town/ferry` charges server-side; `town_ferry_ride` RPC writes ledger reason `ferry_ride` | `api/town/ferry/route.ts`, `0031_ferry_ride.sql` | Bus reuses the route + RPC; needs one small migration for a `bus_ride` reason (§4.5). |
| `WORLD_PX` is consumed only by the position clamp, `layout-core`'s spread origin, and **dead Phaser 2D code** | `api/town/position/route.ts:70`, `layout-core.ts:17`, `phaser/TownScene.ts` | The tile grid can be grown safely — **but see the spread-origin trap in §5.** |
| `city3d.ts` still hardcodes `slug === 'chess-club'` for pad shape + hero | `city3d.ts:884,889,1032` | A second island makes the deferred `islandTheme`-as-data refactor worth doing now. |

**Chess Island's measured size** (`stretch 1.3`, `pad 1.1`):
`halfW 409.6`, `halfH 339.2` → `rx_base 665.7`, `ry_base 453.1` → **size unit `301,644`**.

---

## 2. Sizing: hitting 4×

"4× bigger" is read here as **4× the walkable land area** (≈2× linear). 4× in *every* direction
would be 16× area — larger than a third of the mainland, which would unbalance the world.

Two shapes hit ~4×. Both were checked against `autoFitPad` (both stay at pad 1.1).

### Option A — **two 4×5 regions side by side** ← recommended
Regions 4 tiles apart ⇒ centres 1,945.6 city-px apart.
`halfW = 1382.4`, `halfH = 480` → `rx_base 2056.8`, `ry_base 608` → **1,250,554 = 4.15× Chess** ✅

- Shape: a **long east–west strip** — 3.1× Chess's width, 1.3× its height.
- That silhouette *is a speedway*. The island reads as a racetrack from the air.
- Two regions ⇒ two lands, two unlock costs, a real progression chain, and twice the booth budget
  to fill 4× the ground.

### Option B — one 11×9 region
`halfW = 902.4`, `halfH = 761.6` → `rx_base 1370.4`, `ry_base 917.8` → **1,257,973 = 4.17× Chess**

- Same area, but a chunky blob — a scaled-up Chess Island.
- One landmark and one booth cluster to fill 4× the ground: **it will feel empty.**
- Needs an 11×9 free tile block (bigger grid growth than Option A).

**Recommendation: Option A.** Same area to within 0.5%, better silhouette, better content density.

> Sanity check against the mainland: mainland `rx_base 3923.8 × ry_base 2860.8 = 11.2M` = **37× Chess**.
> A 4.15× race island is **~11% of the mainland** — a substantial second destination that still
> reads as offshore, not a rival continent.

---

## 3. Placement and distance

### Tile rects (save-space bookkeeping)
Grow the grid **downward**: `WORLD_TILES` `{w:16, h:12}` → `{w:16, h:17}`.

```
  race-pit-row     tile {x: 2, y: 12}  size {w: 4, h: 5}   // x 2..5,  y 12..16
  race-victory-ln  tile {x: 6, y: 12}  size {w: 4, h: 5}   // x 6..9,  y 12..16
```

Nothing existing lives below `y = 11`, so there are no rect collisions. Growing height (not width)
keeps the ASCII world map in `regions.ts` readable: **race island sits south of town on the map,
and south of town in the world** — the tile map and the rendered world agree.

### Bearing — no `bearingDeg` needed
Island base centre lands at city `(-460.8, 4518.4)`; mainland centre is `(512, 384)`.
Natural bearing = `atan2(4134.4, -972.8)` ≈ **103° (SSE)**.

- Chess sits at ≈ **217° (NW)**. The two islands are **114° apart** — clearly "a different area." ✅
- So **omit `bearingDeg`** and let the solver's natural placement do the work, exactly like Chess.
  Keep `bearingDeg` in reserve as the one-line tuning knob if it reads wrong in-engine.

### Distance — matches Chess by construction
Solved from the real bean shorelines (`beanShoreDist`, `WADE_SPACING_ND 1.2`, `SEA_GAP 512`):

| | Chess Island | Race Island |
|---|---|---|
| Bearing | ≈217° (NW) | ≈103° (SSE) |
| Mainland shore radius on that bearing | 3,177 px | 2,594 px |
| Island shore radius | 664 px | 645 px |
| Solved centre distance | 5,121 px | 4,398 px |
| **Open-water crossing (shore → shore)** | **≈1,280 px** | **≈1,160 px** |

**≈1,160 px vs Chess's ≈1,280 px — 9% shorter. "About as far away" ✅ with zero tuning.**

At `WALK_SPEED_PX = 220`, the bridge is a **≈5.3 second crossing** — long enough to feel like a
journey, short enough not to be a chore. Worth one moving prop (a candy car whooshing past on a
parallel span) so the walk has something to watch.

---

## 4. The bridge — a road, not a footpath

**Rule: you cross in a vehicle, or you pay 1 Sugar Token to ride the bus. On foot you are turned
back at the barrier.**

This is the plan's best design beat. The race island is the *reason vehicles exist* — a kid who has
never rented a ride hits the barrier, sees the bus, and learns the whole rental system in one moment.
And a place you can only reach with wheels is exactly what a race island should be.

### 4.1 The sea gate — where the rule lives
Today the gate is one line:

```ts
// engine.ts:2330
if (islandNd(px, py) > WADE_ND && !onWalkablePier(px, py)) return true;
```

The bridge adds an exemption that is **conditional on how you're travelling**:

```ts
/** Drive-mode rentals may use the road deck. Fly rides don't need it (they
 *  ignore ground collision entirely). On foot: never — take the bus. */
const mayUseRoad = (): boolean =>
  busing || (vehicleKind !== null && findVehicle(vehicleKind)?.control === 'drive');
```

`control: 'drive'` rides already "obey the island's walls… just like the cupcake on foot"
(`vehicles.ts:20`), so they run through this same predicate — **the vehicle rule costs one clause.**

### 4.2 The barrier — make the rule visible, not mysterious
The deck's first stretch sits over *land* (`nd < WADE_ND`), so a walker could stroll onto the
bridgehead and only get stopped somewhere out over the water. That reads as a bug.

Put a **checkered boom barrier** at the mainland end — a small rect in `avatarBlockedAt` that blocks
on foot regardless of `nd`, and a mesh that visibly **lifts** when `mayUseRoad()` is true. Now the
rule is legible to a 7-year-old before they're confused by it, and the lifting boom is a small
reward every time you arrive with wheels.

Pair it with the approach prompt: *"Bridge is for wheels only — catch the bus 🚌 (1 🪙)"*.

### 4.3 The bus — a ferry that drives on tarmac
**The bus is transit, not a vehicle.** It is emphatically *not* a rentable ride, and this distinction
drives most of its implementation:

| | Rentable ride (`vehicles.ts`) | **The bus** (like the ferry) |
|---|---|---|
| Lives in | `VEHICLE_CATALOG`, has a `VehicleKind` | Nothing. It's town furniture. |
| Persistence | `kid_vehicle_rentals` row + UTC-midnight expiry | None — no ownership to persist |
| Payment | rent once, own it all day | **fare per boarding**, like the ferry |
| Control | the kid steers it | **glued** — you board, it drives, you arrive |
| Availability | only if you rented it | **always standing at the stop**, for everyone |
| Engine state | `vehicleKind` | `busing`, beside `ferrying` — `vehicleKind` stays `null` |

So `ferry.ts` is already the exact primitive: a 2-state machine (`docked` | `sailing`),
`depart(dest)` along a curve, `consumeArrival()` latching arrival, the avatar glued via a flag, and
discover-on-arrival. **The bus is that with the boat swapped for a candy bus and the bezier swapped
for a straight run down the deck.**

Build `bus.ts` alongside `ferry.ts` rather than generalising both into one abstraction now — two
concrete implementations are easier to read than a premature `Shuttle<T>`, and the second one tells
you what the shared shape actually is if a third ever appears.

Engine glue mirrors the ferry line for line: a `busing` flag beside `ferrying`, `boardBus()`,
`BUS_RIDE_Y`, tap-a-bus-stop to board (the ferry's dock interaction, not a rental kiosk), and
`busing` added to the same guard clusters `ferrying` already appears in — `engine.ts:2904`,
`3424`, `3440` — so a kid **cannot dismount mid-span**.

**Do not** give the bus a `VehicleKind`. Every place the engine branches on `vehicleKind` (camera
framing at `2661`, ride FX, `mayUseRoad`) would then have to special-case a ride the kid doesn't
steer. `busing` is the correct flag, and it already has a working precedent two lines above it.

### 4.4 Fare, and the stranding trap
> **SHIPPED DIFFERENTLY (and better).** This section originally specced a fare charged on *every
> outbound trip*. The direction "the bus acts like the ferry" settled it: the ferry charges on the
> **discovering arrival only** (`town_ferry_ride` short-circuits once the region is known), so the
> bus does too — 1 Sugar Token the first time you ever cross, free forever after, in both
> directions. That is simpler, matches the established transport, and makes the stranding problem
> below structurally impossible rather than merely mitigated.

The fare is **1 Sugar Token, charged on the first crossing only. Every later trip, including every
trip home, is free.**

A free return is not a nicety — without it the game can strand a child:

- A kid rides over with their last token, and cannot get home.
- A rental expires at **UTC midnight** (`0029`) while the kid is on the island — their wheels vanish
  mid-session and the bridge closes behind them.

A free return closes both holes and costs nothing thematically (you don't pay to leave a theme park).

The resulting economy is healthy and worth keeping. These are **not competing purchases** — one is a
bus ticket, the other is a toy you get to keep for the day — but they do trade off:

- **No wheels, visiting once** → take the bus. 1🪙, no commitment, always there.
- **Planning to stay and play** → the all-day rental pays for itself on the second trip.

A kid can always afford *some* way across, and the better choice depends on their own plan for the
afternoon. That's a real decision, priced correctly, with no bad option.

### 4.5 Server side — reuse the ferry route, one small migration
`/api/town/ferry` already does exactly the right thing: server-set cost, guest short-circuit,
idempotent, charge-on-arrival behind the engine's optimistic local reveal.

- Widen `via` from `'ferry' | 'fly'` to `'ferry' | 'bus' | 'fly'`; `bus` → cost 1, `fly` → 0.
- Charge **only on the discovering arrival** (the route's existing idempotency) **plus** subsequent
  outbound trips; return trips post `cost: 0`.
- **Migration 0035** to add a `bus_ride` ledger reason so the parent-facing ledger doesn't call a bus
  a ferry. Follow 0031's template — re-state the *full* reason set in the CHECK constraint.
- ⚠️ **Postgres gotcha:** you cannot `create or replace` `town_ferry_ride` with an extra
  defaulted parameter — that creates an *overload*, and existing 3-arg calls then fail as ambiguous.
  `drop function town_ferry_ride(<old signature>);` first, in the same migration.

Consider renaming route + RPC to `transit` while you're in there, since it now serves two vehicles.

### 4.6 The deck itself: `src/lib/town/three/bridge.ts`
Model on `pier.ts` (planks/pilings/railings, `ThreeNS` threaded in, caller owns disposal), with two
deliberate departures:

1. **Arbitrary angle.** `pier.ts` builds along `+x` so its footprint is an axis-aligned rect
   (`pier.ts:116`). A 103° bridge is not. Rather than forcing the island to a cardinal bearing, give
   the deck a **capsule footprint**: `distToSeg(px, py, ax, ay, bx, by) <= halfWidth` — ~5 lines, no
   costlier than `insideRect`, and it frees the bearing to be chosen for looks.
2. **Endpoints derived, not hardcoded.** March from each island's centre to its own shoreline along
   the bearing — the technique the ferry docks already use since the `+409` hack was killed. The
   bridge then auto-follows if `SEA_GAP` or the island's regions ever change.

Styling: road surface with a dashed centre line, candy-striped guardrails, the boom barrier at the
town end, and a checkered start/finish gantry at the island end so the bridge *announces* the theme
before you arrive.

### 4.7 Three ways in (parity with Chess)
| Route | Cost | Notes |
|---|---|---|
| **Bus** | 1🪙 fare outbound, return free | Public transit — always at the stop, owns nothing, glued ride. |
| **Drive across** (skateboard/jeep) | rental (1–2🪙/day) | The "proper" way in. Kid-steered. |
| **Fly in** (biplane/balloon) | rental (4–5🪙/day) | Already works — fly ignores ground collision. |

All three discover the island on arrival. `race-pit-row.neighbors = []` (like `chess-club`) so
`/api/town/discover`'s adjacency check rejects any walk-up attempt **server-side** — the rule is
enforced, not just rendered.

---

## 5. ⚠️ The spread-origin trap — read before touching `WORLD_TILES`

```ts
// layout-core.ts:17
const WORLD_CENTER = { x: WORLD_PX.w / 2, y: WORLD_PX.h / 2 };
```

`spreadCenterPx` flings every region outward **from this point** by `TOWN_SPREAD`. `WORLD_CENTER` is
derived from `WORLD_PX`, so growing the grid `12 → 17` tiles moves it from `y 384` to `y 544` —
and **every existing region re-spreads**, ballooning the mainland bean and moving every land in the
town. Saved positions survive (original space is untouched), but the town's layout visibly changes.

**Fix — do this first, as its own commit:**

```ts
/** Origin the town spreads outward FROM. Pinned to the historical 16×12 world
 *  centre so growing WORLD_TILES (to make room for new island tile rects) does
 *  NOT re-spread the existing town. Do not derive this from WORLD_PX. */
const SPREAD_ORIGIN = { x: 512, y: 384 };
```

Land it with a test asserting `spreadCenterPx('town-square')` is unchanged, verify the town is
pixel-identical, *then* grow the grid in a separate commit.

---

## 6. Phased build

Each phase is independently shippable and reviewable.

**Phase 0 — de-risk the layout (no visible change)**
- Pin `SPREAD_ORIGIN` in `layout-core.ts`; test that every region's spread centre is unchanged.
- Grow `WORLD_TILES` to `{w:16, h:17}`. Confirm the only live consumers are the position clamp and
  the (dead) Phaser scene.

**Phase 1 — the island exists**
- Add `race-pit-row` + `race-victory-lane` to `REGIONS` (`games: []`, scenic for now — the build-time
  invariant only requires *live games* be placed, so an empty land is legal).
- Add `{ id: 'race-isle', theme: 'race', regions: [...] }` to `ISLANDS`.
- Verify in-engine: island silhouette, ~4× area, ~1,160px gap, no overlap with Chess.
- Reachable by flying rental only at this point — a good standalone checkpoint.

**Phase 2 — the road bridge (vehicles only)**
- `bridge.ts` (capsule deck) + the `mayUseRoad()` clause in the sea gate + the boom barrier rect.
- `race-pit-row.neighbors = []`, `race-victory-lane.neighbors = ['race-pit-row']`. Empty neighbours
  make `/api/town/discover` reject walk-up **server-side**, exactly as it does for `chess-club`.
- Generalize `discoverChess(via)` → `discoverOnArrival(slug, via)` so a **fly landing** on the race
  island discovers it too. Without this, a kid who lands a plane on an undiscovered race land gets
  snapped back out by the fog rect (`engine.ts:1317` runs before the blocked-snap for exactly this
  reason).
- **Playable checkpoint:** at the end of this phase the island is reachable by jeep, skateboard,
  biplane and balloon — everything except the bus. Ship and playtest here before Phase 2b.

**Phase 2b — the bus**
- Migration **0035**: `bus_ride` ledger reason (full CHECK re-state) + `drop`/`create` of
  `town_ferry_ride` if its signature changes. Apply via the Supabase Mgmt API PAT in Windows
  Credential Manager; **verify by invoking**, not just by creating.
- `bus.ts` + `busing` flag + `boardBus()` + dismount guards, mirroring the ferry glue.
- Widen `via` in `/api/town/ferry`; outbound 1🪙, return 0🪙.
- Bus stops at both bridgeheads; tap to board.

**Phase 3 — it looks like a speedway**
- Do the deferred `islandTheme`-as-data refactor rather than adding a second hardcoded slug branch
  beside `city3d.ts:884/889/1032`. Chess's checkerboard pad and the race island's oval track pad
  both become theme data.
- Track surface, tyre-stack barriers, grandstand, checkered flags, a start/finish gantry as the
  island's hero landmark.

**Phase 4 — games**
- Nothing racing exists in `GAME_REGISTRY` yet, so this is greenfield. Two that fit the two lands:
  - **Pit Row** — a timed pit-stop drill (answer to change a tyre; the clock is the pressure).
  - **Victory Lane** — a lap racer where correct answers are the throttle.
- Follow `docs/creating-a-new-game.md`; register in `regions.ts` `games: []`.

---

## 7. Open decisions

> **Resolved at ship time:**
> - *Which rentals may cross?* — **any `control: 'drive'` ride** (skateboard + jeep). The narrower
>   jeep-only rule was considered to protect the bus's usefulness, but once the fare became a
>   one-time discovery charge (§4.4) the bus stopped competing with rentals on price at all: it is
>   the always-there option for a kid with no wheels. Allowing both needs no arbitrary in-world
>   excuse for turning a skateboard away. One line in `bridge.ts` if you want to revisit.
> - *Bus fare model* — see §4.4.

1. **4× area vs 4× linear.** This plan assumes area (§2), and that is what shipped (4.146×). If
   "4× bigger" meant twice as wide *and* twice as tall in the sense of 16× area, it's a different
   tile-rect table, same plan.
2. **Does the bus keep running, or is it a starter service?** As specced it's permanent transit.
   A variant worth considering later: once a kid owns a vehicle they mostly stop using it, so the
   bus quietly becomes the "I'm broke" safety net rather than a real route. That's fine — just don't
   over-invest in bus polish.
3. **Ferry stop at the races?** The ferry is point-to-point (`docked`|`sailing`). A race stop needs
   the deferred N-stop work. Not required — the bridge is the route — but "ferry to the races" is a
   natural later add.

**Settled by direction (2026-07-25):** bridge access = vehicles + a 1🪙 bus, no foot traffic (§4).

## 8. Known risks

- **Minimap framing.** It bisection-traces the *mainland* shoreline and frames to include all region
  dots. A third island 4,400px SSE will stretch the frame; check it still reads at tablet size.
- **Stranding is the #1 risk of this access model.** Three ways a kid can end up on the island with
  no way home: spent their last token on the outbound bus; rental expired at UTC midnight; a storm
  re-locked the land they're standing on. The **free return leg is the single mitigation** for the
  first two — treat it as a correctness requirement, not a nicety, and test it explicitly at
  **zero balance**.
- **Storms.** `stormRect` targets discovered non-starter game lands, so a storm can re-lock a race
  land. Verify a storm cannot spawn *on the bridge deck* (that would wall the span itself), and that
  a storm on the island never blocks the route back to the bus stop.
- **Mid-span dismount.** Extend the existing `riding || vehicleKind || ferrying` dismount guards
  (`engine.ts:3424,3440`) to cover the bridge, or a kid can step off their jeep over open water onto
  a deck they aren't allowed to stand on.
- **Cakey** uses strict `blockedAt` (no pier/bridge exemption), so he stays ashore and won't follow
  the kid across. Intentional for now; revisit if it reads as him being left behind.
- **Concurrent working tree.** `~/Documents/learning-world` is edited by parallel sessions. Build
  this in a **git worktree off `origin/master`**, push early. Note Turbopack `next build` fails on a
  junctioned worktree — verify the full build via the Vercel PR preview.
