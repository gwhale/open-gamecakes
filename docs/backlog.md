# Gamecakes Backlog

Living backlog for the **multi-family platform** effort and related tracks.
Detailed design lives in the approved plan (`~/.claude/plans/i-want-a-way-scalable-kettle.md`)
and in agent memory (`project_gamecakes_multi_family_platform`).

**Goal:** open Gamecakes from a single household ("The Shacks") to many families —
each an isolated ecosystem, onboarded by request → review → approve — while the
game keeps evolving centrally for everyone (shared code + per-family data).

Status: `DONE` · `NEXT` · `BACKLOG` · `DEFERRED` · `DEBT`

---

## ✅ Done — Phase 0: isolation hardening (prerequisite)

- **0a/0b** (PR #206, merged): app-code IDOR guards — `requireKidInFamily()` on the 6
  unguarded endpoints; gated layout rejects a foreign/stale `lw_kid` cookie.
- **0c** (PR #207 / migration 0034, applied to prod): DB-level backstop — `family_id`
  (+backfill +auto-fill trigger) on the 7 legacy tables; RLS enabled on the 3 uncovered
  tables; per-family owner RLS policies on all 15 family-scoped tables. Verified the
  `sb_secret_` key bypasses RLS → zero runtime impact.

Isolation now holds in two layers (app-code primary, DB RLS backstop). Also live:
grown-up-mode PIN gate (PR #205), demo family (`demo`/`demo1234`, PIN `1234`, kids Sam+Max).

---

## 🔜 NEXT — Phase 1: new-family viability

Make an approved family actually usable.

- ~~**`POST /api/kids`** + **`/parent/kids/new`**~~ — shipped. A parent can add a
  kid (handle + grade, nothing else).
- ~~**The path to the first kid**~~ — the free-account UX walkthrough
  (`shared/personal/gamecakes/audits/2026-09-25-…`, Claude + Codex) found signup
  landing on an empty `/kids` grid with no link anywhere to the parent area.
  Fixed in `fix/free-account-path`: signup enters grown-up mode and lands on
  `/parent/kids/new`; `/kids` has an empty state + Grown-ups/Log out footer;
  `/parent` puts "Add your first player" first when there are none.
- ~~**Tier-gated controls shown to restricted families**~~ — same branch: Story
  Oven button, What's Baking, Add Note, Sugar Token grants, weekly email are
  hidden via `FamilyCapabilitiesProvider` instead of 403ing after input.
- **Per-family Guest/sandbox** — Guest is one global row owned by The Shacks
  (`GUEST_KID_ID`), invisible to new families. Either a `kids.is_guest` flag seeded per
  family, or drop Guest now that real kids are creatable. _(size: S)_
- ~~Neutralize the "claim The Shacks" hack~~ — claims now require
  `invite_codes.claim_family_id` (migration 0052).
- **Password recovery.** Logins map to a synthetic address that receives no
  mail, so there is no reset path; a forgotten password loses the family. The
  signup form now says so. A real fix is an optional recovery email collected
  at signup (schema change + baseline regen). _(size: M)_
- **Remove a player.** No DELETE on `/api/kids` and no UI; the cap copy no
  longer tells parents to "remove a player first". Needs a cascade decision
  (attempts, tokens, town). _(size: S–M)_
- **Rename a player UI.** `PATCH /api/kids` exists (the no-PII promise depends
  on it) but nothing calls it. _(size: XS)_
- **Throttle slot burned on taken-login collisions.** `claimSignupSlot` runs
  before `createUser`, so 5 collisions on a popular slug from one network locks
  it out for a day. Fix needs a refund RPC or a cheap existence check
  (migration). _(size: S)_
- ~~De-hardcode founder starter lands~~ — **largely moot in prod:** the drift audit found
  migration 0024 was never applied, so prod's starter trigger seeds only
  `town-square`+`cookie-corner` (not the per-kid lands). Keep as a small
  `regions.ts` cleanup only. _(size: XS)_

---

## 📋 BACKLOG — Phase 2: request → review → approve onboarding

- **Public `/request-access` form** (unauthenticated) → `access_requests` table
  (name, contact email, kids' ages, note, status `pending|approved|denied`). Rate-limit. _(size: M)_
- **Super-admin review queue** — a lightweight super-admin role (George; flag on the auth
  user or env-listed id), admin-only page to approve/deny. Reuse option: host the queue in
  the WW portal (`portal.wholewhale.com`) kanban instead of in-app. _(size: M)_
- **Approve → provision** — reuse `invite_codes` (`createInviteCode()`) to mint a single-use
  code + email the requester (or auto-create the family). Existing `/api/auth/signup` then
  yields a working, addable family. _(size: S–M)_

## 📋 BACKLOG — Phase 3: per-family "configure & curate" (light)

Scope per George: pick which games/lands show + set per-kid difficulty. **No content authoring.**

- **Game/land visibility** per family/kid — `family_settings` config over the shared
  `GAME_REGISTRY`/`REGIONS` catalogs + existing `kid_region_discoveries` gating. _(size: M)_
- **Per-kid difficulty dial** — surface `kids.grade` + `GRADE_BASELINE_TIER` in the parent
  UI. **Depends on adding `kids.grade` to prod** (drift: 0015 never applied). _(size: S + migration)_
- Optional per-family theme accent (cosmetic). _(size: S)_

---

## 🧹 DEBT — reconciliation & foundations

- **Migration drift (repo ↔ prod).** Prod was applied ad hoc; `schema_migrations` tracks
  only 5 unrelated rows; repo numbering ≠ prod. Confirmed never applied: **0006
  (`ccss_standards` table), 0015 (`kids.grade`), 0024 (4-land trigger)**. Operating rules
  adopted: introspect live schema before any DDL; write idempotent migrations; treat repo
  files as documentation. Full reconciliation (bring prod to a known, tracked baseline) is
  its own task. _(size: M)_
- **Add `kids.grade`** properly (blocks Phase 3). _(size: XS migration)_
- **Cross-family isolation test.** vitest is in place (650+ unit tests); still missing is an
  **automated isolation test** (2nd family must 403 against family #1). _(size: M)_

---

## 🧊 DEFERRED — bigger tracks (explicitly out of the current plan)

- **Age expansion to ~15.** Content stops at grade 6 (skills, `GRADE_BASELINE_TIER` K–5,
  tier ceiling 10, generators end ~multiplication). Reaching 15 = grades 7–9 content:
  fractions → decimals → pre-algebra → algebra, wider tier/level mapping, new generators.
  Separable content project. _(size: L)_
- **"Fork / create your own games" — real authoring.** Current scope is configure-only.
  A real version activates the dormant `games`/`content` tables so families/kids author
  data-driven content (question sets, word lists, levels) on the shared engines. Note the
  original spec (`docs/spec.md` §3.4) envisioned an AI "Game Creator Pipeline." `/create-game`
  today is only a kid suggestion box. _(size: L)_
- **Multi-parent households.** Current model is one login per family (no membership table).
  A second-adult-per-family model reshapes the tenancy refactor — cheaper to design in
  before it's needed. _(size: M–L)_

---

## ❓ Uncaptured — George's "other features"

Placeholder for the additional feature ideas George mentioned but hasn't listed yet. Most
likely affect Phases 2–3; capture here before building Phase 1 so they can be folded in.

_(to be filled in)_
