# Learning World — Phase 1 Foundation Plan

## Context

Building an iPad-optimized adaptive kids' learning game (spec: `C:\Users\gewei\Downloads\product_spec_kids_learning_world.md`). This plan covers **Phase 1 only** — the foundation slice defined in spec §12:

- Next.js app deployed to Vercel
- Supabase project with core schema from spec §4.3
- Parent password gate
- Kid selection screen
- Empty overworld map shell

No mini-games, no adaptive engine, no AI game creator yet — those come in later phases. The goal is an end-to-end skeleton you can log into as a parent, pick a kid profile, and land on a placeholder map. Everything after Phase 1 will be planned separately once this slice is live.

**Key constraint from spec §8:** no email-based auth, no OAuth. A shared parent password protects the app, kids pick their avatar (optionally with a 4-digit PIN). This means we **do not** use Supabase Auth — we use a cookie-based parent gate and treat "active kid" as client state backed by a `kids` row.

**Reference project:** `C:\Users\gewei\Documents\LCFA Trial Finder\lcfa-trial-finder\` uses the same stack (Next.js 16 + Supabase + Tailwind 4). Its `src/lib/supabase.ts` pattern will be reused. **Important:** Next.js 16 has breaking changes — before implementing, read `node_modules/next/dist/docs/` per LCFA's `AGENTS.md` guidance, and use context7 for Supabase docs.

## Stack decisions (locked)

| Layer | Choice | Version target |
|---|---|---|
| Framework | Next.js (App Router) | 16.x (match LCFA) |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| DB + Storage | Supabase (new project) | latest |
| Supabase client | `@supabase/supabase-js` | ^2.102 |
| Hosting | Vercel | — |
| Parent gate | Cookie-based, env-var password | custom |

Deferred to later phases: `react-konva`/SVG map interactivity, `@use-gesture/react`, Framer Motion, Claude API integration, PWA manifest.

## Project location

New repo at: `C:\Users\gewei\Documents\learning-world\`

Initialized via `npx create-next-app@latest learning-world --ts --tailwind --app --eslint --src-dir --import-alias "@/*"` (confirm flag set against current Next.js 16 CLI before running).

## Files to create

### Config & root
- `learning-world/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PARENT_PASSWORD`, `PARENT_COOKIE_SECRET`
- `learning-world/.env.example` — same keys with placeholder values, committed
- `learning-world/.gitignore` — ensure `.env.local` excluded
- `learning-world/README.md` — setup steps, env vars, supabase migration command

### Supabase
- `learning-world/supabase/migrations/0001_init.sql` — all tables from spec §4.3: `kids`, `skills`, `content`, `kid_skills`, `attempts`, `games`. Include indexes on FKs and `kid_skills(kid_id, skill_id)` unique. RLS: **disabled for Phase 1** (server routes use service role key; no direct client → Supabase writes from the browser). Add a comment noting RLS will be enabled when we introduce per-kid client access.
- `learning-world/supabase/migrations/0002_seed_kids.sql` — insert 2 seed kid rows (names TBD — use "Kid A" / "Kid B" placeholders, PIN null, avatar emoji).

### Library code
- `learning-world/src/lib/supabase/server.ts` — server-side client using `SUPABASE_SERVICE_ROLE_KEY` (used from API routes only). **Never import from client components.**
- `learning-world/src/lib/supabase/browser.ts` — public anon client. Phase 1 only uses it for read-only queries if needed; most data access goes through API routes.
- `learning-world/src/lib/auth/parent-gate.ts` — helpers: `verifyParentPassword(input)`, `setParentCookie(res)`, `readParentCookie(req)`, `requireParentCookie()` for server components. Use signed cookie (HMAC with `PARENT_COOKIE_SECRET`) — do **not** store the password itself. HttpOnly, SameSite=Lax, 30-day expiry.
- `learning-world/src/lib/auth/active-kid.ts` — helpers for the "current kid" cookie: `setActiveKid(kidId)`, `getActiveKid()`. Separate cookie from parent gate.
- `learning-world/src/lib/types.ts` — TypeScript types for `Kid`, `Skill`, `Game`, etc. matching the schema.

### App routes (Next.js App Router)
- `learning-world/src/app/layout.tsx` — root layout, sets `apple-mobile-web-app-capable` meta, landscape orientation hint, global font. **Checks parent cookie** — if missing and path != `/gate`, redirect to `/gate`.
- `learning-world/src/app/globals.css` — base Tailwind + min tap target CSS var (44px).
- `learning-world/src/app/page.tsx` — redirect to `/map` if active kid set, else `/kids`.
- `learning-world/src/app/gate/page.tsx` — parent password form. Posts to `/api/gate`.
- `learning-world/src/app/api/gate/route.ts` — POST handler: verify password, set signed cookie, redirect to `/kids`. Rate-limit with in-memory counter (Phase 1 acceptable; swap for Upstash later).
- `learning-world/src/app/kids/page.tsx` — server component, fetches kids list via server supabase client, renders avatar grid. Each avatar is a form that POSTs to `/api/kids/select`.
- `learning-world/src/app/api/kids/select/route.ts` — sets active-kid cookie, redirects to `/map`.
- `learning-world/src/app/map/page.tsx` — empty overworld shell. Reads active kid, shows "Welcome, {name}" header, placeholder SVG map area with 4–6 greyed-out location circles (no interactivity yet), a "Switch Kid" button that clears active-kid cookie and returns to `/kids`.
- `learning-world/src/app/map/layout.tsx` — ensures active kid cookie present, else redirect `/kids`.

### Scripts
- `learning-world/scripts/apply-migrations.md` — document `supabase db push` workflow (using Supabase CLI against the new project). Migrations run manually in Phase 1 — no CI yet.

## Reused patterns from LCFA

- `src/lib/supabase.ts` env-var fallback pattern (`src/lib/supabase/browser.ts`)
- Next.js 16 App Router + Tailwind 4 + TS project layout
- `AGENTS.md` discipline: read `node_modules/next/dist/docs/` before touching App Router APIs

## Deployment

1. Create Supabase project in dashboard (region close to user); save URL, anon key, service role key.
2. Run migrations via Supabase CLI: `supabase db push` (after `supabase link`).
3. Push repo to GitHub (new private repo `learning-world`).
4. Import to Vercel, add env vars, deploy.
5. Test live URL from iPad Safari.

## Verification

End-to-end smoke test (run locally first with `npm run dev`, then against Vercel deployment):

1. **Gate blocks unauth:** Visit `/map` in fresh browser → redirected to `/gate`.
2. **Wrong password rejected:** Submit bad password → error shown, still on `/gate`.
3. **Correct password lets through:** Submit `PARENT_PASSWORD` → lands on `/kids`, sees 2 avatars.
4. **Kid selection works:** Tap Kid A avatar → lands on `/map`, header shows "Welcome, Kid A".
5. **Active kid persists:** Reload `/map` → still on map, no re-prompt.
6. **Switch kid clears state:** Tap "Switch Kid" → back to `/kids`, can pick Kid B.
7. **Parent cookie persists across sessions:** Close tab, reopen, visit `/` → still past the gate (30-day cookie).
8. **iPad touch targets:** Load on actual iPad in Safari; all buttons ≥ 44px tap target; layout doesn't overflow.
9. **DB state:** Query `kids` table in Supabase dashboard → confirms 2 seed rows exist and match what's shown in UI.
10. **No Supabase anon writes:** Grep source for client-side `supabase.from(...).insert|update|delete` → should return zero results; all writes go through `/api/*` routes.

## Out of scope for this plan (explicitly deferred)

- Any mini-game template (Phase 2)
- Adaptive difficulty engine (Phase 2)
- Map interactivity / react-konva / pin tapping (Phase 3)
- Claude API integration (Phase 6)
- Parent dashboard (Phase 5)
- PWA manifest / Add to Home Screen (Phase 7)
- Supabase RLS policies (enable when browser reads kid-specific data)
- Rate limiting beyond in-memory (swap to Upstash later)
- Real kid names (use placeholders; rename once you confirm)

## Open questions to resolve during execution

1. Real names for the two seed kids — or keep "Kid A / Kid B" for now?
2. Where to put the Supabase project in the Whole Whale org, or a personal account?
3. Is the Vercel deployment personal or under WholeWhale org?
