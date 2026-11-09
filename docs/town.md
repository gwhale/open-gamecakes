# Gamecakes City

Token-gated explorable Phaser town at `/town`. Kids walk an avatar around an 8-region map, earn tokens by playing games, and spend tokens to defog adjacent regions.

This doc covers how the feature is wired and where to make common changes.

## Architecture overview

```
Page render (server)
  /town/page.tsx
    ├─ getActiveKid()
    ├─ Supabase reads (parallel):
    │   - kids (name + avatar)
    │   - kid_region_discoveries
    │   - kid_avatar_position
    │   - kid_tokens (balance)
    └─ render <PhaserTownHost initialBalance={...} sceneProps={...} />

Client (PhaserTownHost)
  - Owns React state: balance, discoveredSlugs, modal state
  - Mounts Phaser via dynamic import; never SSRs the canvas
  - Bus listeners drive React state machines

Phaser scene (TownScene)
  - Renders region rects, fog rects, building containers, avatar
  - Walks avatar toward moveTarget at 220 px/s
  - Per-frame approach detection on fogged + adjacent regions
  - Position emit every 3 s + on shutdown + before enter-game
  - Secondary minimap camera in upper-right corner
```

## Bus event vocabulary

These events flow over the `hostBus` (a `Phaser.Events.EventEmitter`) shared between the React host and the Phaser scene. Adding a new event? Update both sides.

| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `scene:sfx` | scene → host | `{ name: SoundName }` | Play an audio cue + matching haptic |
| `town:position-update` | scene → host | `{ region_slug, x, y }` | Throttled position save (host POSTs `/api/town/position`) |
| `town:enter-game` | scene → host | `{ gameSlug }` | Avatar arrived at a building; host `router.push`es to `/games/{slug}` |
| `town:approach-fog` | scene → host | `{ regionSlug, cost }` | Avatar within `FOG_APPROACH_DISTANCE_PX` of a fogged-and-adjacent region; host opens `UnlockRegionModal` |
| `town:request-discover` | host → scene | `{ regionSlug }` | Successful discover POST — scene runs the unlock animation |

## Region catalog (`src/lib/town/regions.ts`)

Single source of truth for layout, costs, neighbors, game placement. Lives in TS (not the database) because the catalog iterates faster than schema migrations would allow. Trade-off: `region_slug` is a free-form text key in `kid_region_discoveries`, so the discover route validates against the catalog before the RPC runs.

### Add a region

1. Append to `REGIONS` with a unique `slug`, valid `tile`+`size` that doesn't overlap an existing region, an `unlock_cost`, and `neighbors` listing the slugs of regions the kid must have to be eligible to unlock this one.
2. If the new region holds games, list their slugs from `GAME_REGISTRY` in `games[]`. The build-time invariant in `regions.ts` (dev mode) warns about unplaced games.
3. Add a `themeColor` from the brand palette so the tile and modal have a consistent tint.
4. Set `spawnPoint` to the pixel center of the region (use `center(tile, size)`).

### Retire a region

Setting `unlock_cost: 0, starter: true` doesn't gracefully migrate already-spent tokens. If a region is to be removed, prefer:

1. Empty `games[]` (so building UI no longer renders).
2. Update `neighbors[]` of any region that pointed at it.
3. Delete the catalog entry.
4. **Note**: existing rows in `kid_region_discoveries` for the deleted slug are harmless — the catalog lookup will return `undefined`, and the slug is silently ignored by the scene's discover state. They can be left in place as historical record.

## Token economy (`src/lib/tokens/mint.ts` + RPC `mint_tokens`)

Tokens earn from `/api/attempts` after every completed game session:

- **Drip**: `+1` per `summary.completed === true && correct === true`
- **Tier-up bonus**: `+5` when `applyAttempt()` returns `tieredUp: true`

Both stack. Configurable via the `DRIP_PER_SESSION` and `BONUS_PER_TIER_UP` constants. Idempotency lives in the database — a unique partial index on `token_transactions((metadata->>'attempt_id'))` blocks double-mints from flaky retries.

Spending happens via `town_discover_region` RPC (called from `/api/town/discover`). The RPC takes a `FOR UPDATE` lock on the wallet row so concurrent unlock attempts serialize cleanly.

## Parent admin (`/parent/tokens`)

- Lists every kid in the family with current balance + lifetime counters + last 10 ledger entries.
- Per-kid grant form posts to `/api/parent/tokens/grant` with `delta` capped at 100. Writes a `parent_grant` token transaction; idempotency partial index does NOT fire because parent grants don't include an `attempt_id`.
- Guest sandbox is rendered but its grant form is suppressed — guest has no real wallet.

## Tuning knobs

| Constant | File | Default | What |
|---|---|---|---|
| `DRIP_PER_SESSION` | `src/lib/tokens/mint.ts` | 1 | Tokens per completed win |
| `BONUS_PER_TIER_UP` | `src/lib/tokens/mint.ts` | 5 | Bonus on skill tier-up |
| `WALK_SPEED_PX_PER_SEC` | `src/lib/town/phaser/TownScene.ts` | 220 | Avatar walk speed |
| `FOG_APPROACH_DISTANCE_PX` | `src/lib/town/phaser/TownScene.ts` | 70 | How close to fog before approach event fires |
| `POSITION_EMIT_INTERVAL_MS` | `src/lib/town/phaser/TownScene.ts` | 3000 | Position-save cadence |
| `FOG_FADE_DURATION_MS` | `src/lib/town/phaser/TownScene.ts` | 800 | Unlock animation length |
| `GRANT_MAX` | `src/app/api/parent/tokens/grant/route.ts` | 100 | Soft cap on parent grant |

## Schema (migrations 0016 + 0017)

- `kid_tokens(kid_id pk, family_id, balance, total_earned, total_spent, updated_at)`
- `token_transactions(id, kid_id, family_id, delta, reason, metadata, created_at)`
- `kid_region_discoveries((kid_id, region_slug) pk, family_id, discovered_at)`
- `kid_avatar_position(kid_id pk, family_id, region_slug, x, y, updated_at)`

Triggers:
- `kids_init_tokens` — auto-creates `kid_tokens` row at balance 5 for new kids (0016)
- `kids_init_town_starters` — auto-seeds `town-square` + `cookie-corner` for new kids (0017)

Functions:
- `mint_tokens(p_kid, p_family, p_delta, p_reason, p_metadata)` — atomic mint or no-op on duplicate `attempt_id` (0016)
- `town_discover_region(p_kid, p_family, p_region_slug, p_cost)` — atomic spend with `FOR UPDATE` wallet lock (0017)

RLS: **OFF** on every kid-scoped table including these. Family scoping is enforced application-side via `requireSessionOrJson()` + `family_id` filter on every query. Phase 2 of the auth roll-out will sweep RLS on, with policies based on `families.owner_user_id = auth.uid()` chained through `family_id`.

## Coexistence with `/map`

`/map` (Math Land + Vocab Land picker) is unchanged — `/town` is purely additive. The "✨ Visit Gamecakes City (new!)" pill in `/map`'s footer points kids at the new experience. Once the city is fully shaken out, the legacy land picker can be retired by:

1. Removing `/map/math/page.tsx` and `/map/vocab/page.tsx` (and their game grids).
2. Replacing `/map/page.tsx` with a `redirect('/town')`.
3. Deleting `MapMenu.tsx`'s desktop pill row (the wallet badge moves into the town chrome which already has a `BalancePill`).

Don't do this before iPad-real-device sign-off on PR 6.
