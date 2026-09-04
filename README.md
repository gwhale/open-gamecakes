# Gamecakes

**Open-source learning games where the question is the gate.** Kids explore a
walkable 3D town and play real games — but the walls, the doors and the next
level open by answering maths and reading pitched at *that child's* level, and
the level moves with them as they get better.

You run your own copy: your family's data lives in a database only you can
reach, you decide what your kids can play, and nobody is selling them anything.

iPad-first, Next.js 16 + Supabase. The founding deployment is
[gamecakes.org](https://gamecakes.org).

**Running it for your own kids?** → **[SELF_HOSTING.md](SELF_HOSTING.md)**
**Contributing?** → **[CONTRIBUTING.md](CONTRIBUTING.md)**

## What's here

- **24 games** across math, reading and logic — Phaser 3 for 2D, hand-written
  Three.js for 3D. Registry in `src/lib/games/registry.ts`.
- **A walkable town** (`/town`) of 13 regions kids unlock by earning cookies.
  Raw imperative `three`, no React-Three-Fiber, no physics engine.
- **Adaptive difficulty** — attempts are recorded per round, mastery is a
  rolling window, tiers move up and down. Questions are chosen inside a
  `[grade-1, grade+1]` band so nobody gets an impossible or trivial one.
- **A parent dashboard** (`/parent`) — progress against CCSS standards,
  observations, Sugar Token grants, and photo upload with AI extraction that
  pre-fills an observation from a picture of homework.
- **Kid-filed tickets** — kids report bugs and request features from inside the
  game, and own the lifecycle for games they invented.
- **Multi-family isolation** — every row is scoped to a family and enforced by
  row-level security, not by application code remembering to filter.

## Auth model

| Gate | Secret | Who types it |
|---|---|---|
| Family login (`/login`) | a login slug + password, held in Supabase Auth | a parent, once per device |
| Kid profile | that kid's PIN, in `kids.pin` | the kid |
| Grown-up mode (`/grownups`, gates `/parent`) | the family's PIN, in `families.parent_pin` | a parent, each session |

Grown-up mode is a short-lived signed elevation cookie
(`src/lib/auth/parent-mode.ts`), enforced on both the screens and the
parent-only API routes. A kid holding the device is bounced to the PIN gate
rather than ever rendering parent content.

**No email is involved and there is no site password.** At signup a parent
chooses a family login slug (e.g. `shackleton`) and a password. The slug maps to
a synthetic address `<slug>@gamecakes.family`, created with `email_confirm: true`
— that domain is unregistered and never receives mail, so there is no
confirmation step and no magic link to wait for. Sessions, JWTs and RLS are then
stock Supabase Auth. See `src/lib/auth/login-name.ts`.

Signup is invite-only; run `node scripts/setup.mjs` to mint a code.

Kid PINs are database values set from the parent dashboard, not configuration.

## Configuration

Everything lives in `.env.local` (gitignored). `cp .env.example .env.local` to
start. Generate each 32-byte secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Required

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL, `https://<ref>.supabase.co`. Settings → API. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`. Safe in a browser; RLS is what protects the data. |
| `SUPABASE_SECRET_KEY` | `sb_secret_…`. **Bypasses every access rule.** Server only — never commit it, never send it to a browser. |
| `NEXT_PUBLIC_ENABLE_NEEDLE_TOWN` | `0` unless you are working on the experimental renderer. |

There is no password variable. Accounts live in Supabase Auth — see
[Auth model](#auth-model) above.

### Optional — each switches on one feature

| Variable | Effect if unset |
|---|---|
| `OPENROUTER_API_KEY` | Photo-to-observation AI extraction is unavailable; the rest of the dashboard is unaffected. [openrouter.ai/keys](https://openrouter.ai/keys) |
| `RESEND_API_KEY`, `DIGEST_FROM`, `NEXT_PUBLIC_SITE_URL` | No weekly family digest email. Needed together. |
| `CRON_SECRET` | The weekly-digest cron route rejects calls; set any long random string so the endpoint cannot be triggered by anyone who finds the URL. |
| `REALTIME_TOPIC_SECRET` | Signs the public Realtime channel name for town presence, so a raw `family_id` is never a guessable channel. Any long random string; rotating it disconnects current sessions. |
| `BA_PASSWORD` | Has a working default. Set it only if you use the standalone `/ba` arcade. |
| `ELEVENLABS_API_KEY` | Build-time only, and not read by the app. Voice mp3s ship pre-rendered and are served statically, so playing never calls a TTS API. A key is needed only to regenerate lines. |

## Setup

```bash
npm install                     # .npmrc sets legacy-peer-deps; three is a prerelease fork
cp .env.example .env.local      # then fill in the table above

npx supabase link --project-ref <your-ref>
npx supabase db push            # applies supabase/migrations/0001_baseline.sql

node scripts/setup.mjs          # verifies everything, creates buckets, mints an invite code
npm run dev
```

`scripts/setup.mjs` is the one to run when something looks wrong — it reports
which step is unhappy and what fixes it. Full walkthrough in
[SELF_HOSTING.md](SELF_HOSTING.md).

## Database

`supabase/migrations/0001_baseline.sql` builds the entire schema in one file:
25 tables, their indexes and constraints, 21 row-level-security policies, the
functions and triggers, both private storage buckets, and the 64-row skills
catalog. **New migrations are numbered from 0046.**

Regenerate or verify it with `scripts/opensource/baseline.mjs`. Fingerprint two
projects and diff them to prove a migration lands identically on both — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

- Next.js 16 (App Router, Turbopack) + React 19, TypeScript strict
- Tailwind CSS 4, rough.js for the hand-drawn look
- Phaser 3 (2D games), `three` (town + 3D games)
- Supabase — Postgres, Auth, Storage
- OpenRouter for vision; ElevenLabs for pre-rendered voice
- Vercel

## Notes

- **Next.js 16 is not the Next.js you know.** See `AGENTS.md`; read
  `node_modules/next/dist/docs/` before touching router APIs.
- **RLS is on.** 25 tables have it enabled and 21 policies enforce family
  isolation. Five tables (`content`, `games`, `invite_codes`, `parents`,
  `skills`) are RLS-enabled with *no* policy on purpose — that denies every
  client role and leaves them readable only by the server. Adding a permissive
  policy to "fix" one would expose invite codes and parent records.
- **Supabase clients are lazy-initialised** (`src/lib/supabase/server.ts`) so a
  production build needs no credentials. CI builds with placeholders to prove
  it on every commit.
- **The migration folder is not a description of the database.** Whether a
  column exists is a fact about the database. Check the database.
- **Vercel does not fetch Git LFS.** Authored art under `art/` is LFS-tracked;
  runtime assets under `public/` deliberately are not. An LFS-tracked file
  under `public/` deploys as a ~130-byte pointer and breaks the build.
