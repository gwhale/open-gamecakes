# Running Gamecakes for your own kids

You need a Supabase project (the free tier is plenty), Node 20 or newer, and
about fifteen minutes. Everything below is one-time.

Your family's data lives in **your** Supabase project. Nobody else can see it,
including whoever wrote this. That is the whole point of the setup being
bring-your-own-database rather than an account on someone's server.

---

## 1. Get the code

**Fork** the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/<you>/open-gamecakes.git
cd open-gamecakes
npm install
```

`npm install` may look like it is warning at you. It is fine — `three` is
pinned to a prerelease fork, and the committed `.npmrc` sets
`legacy-peer-deps=true` so a clean install resolves. Without it you would get
an `ERESOLVE` error, which is why the file is there.

## 2. Make a Supabase project

At [supabase.com](https://supabase.com), create a project. Any region, free
tier. Save the database password it gives you — you will want it in step 3, and
it is not recoverable later (only resettable).

Then open **Project Settings → API** and keep the tab open. You need two values:

| Setting | Looks like | Goes in |
|---|---|---|
| Project URL | `https://abcdefghijk.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key | `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key | `sb_secret_…` | `SUPABASE_SECRET_KEY` |

The secret key bypasses every access rule in the database. It belongs in
`.env.local` (already gitignored) and must never reach a browser or a commit.

## 3. Fill in `.env.local`

```bash
cp .env.example .env.local
```

Set the three Supabase values and leave `NEXT_PUBLIC_ENABLE_NEEDLE_TOWN=0`.
**That is all you need to run.**

There is no password to put in this file. Your family's login is a Supabase Auth
account you create in step 6, and each kid gets a PIN you set from the parent
dashboard.

Everything else in `.env.example` switches on one optional feature and can stay
empty: `OPENROUTER_API_KEY` for photo-to-observation extraction, the Resend
trio for the weekly digest email, `CRON_SECRET` and `REALTIME_TOPIC_SECRET` if
you use those routes. Cakey's voice lines are pre-rendered mp3s served as static
files — the app never calls a text-to-speech API, so playing costs you nothing
no matter how much your kids play.

## 4. Create the database

```bash
npx supabase login
npx supabase link --project-ref <the subdomain of your project URL>
npx supabase db push
```

That applies `supabase/migrations/0001_baseline.sql`, which builds every table,
index, security policy and the skills catalog in one file.

No CLI, or it will not connect? Open the **SQL editor** on your dashboard, paste
the contents of that file, and run it. Same result.

## 5. Check it and get your invite code

```bash
node scripts/setup.mjs
```

It verifies the schema, confirms the skills catalog, creates the two private
storage buckets, and prints an invite code. Safe to run as many times as you
like — it checks before it acts, and if something is wrong it tells you which
thing and what to do about it.

## 6. Play

```bash
npm run dev
```

Open <http://localhost:3000/signup> and fill in:

- the **invite code** from step 5
- a **family login** — a short slug your household will type, like `okonkwo`.
  Lowercase letters, numbers and hyphens, 3–20 characters.
- a **password** of your choosing
- your **family name**, and the parent-consent checkbox

You are signed straight in and land on `/parent`. **No email is sent and there
is nothing to confirm** — the login slug is mapped to an internal address that
never receives mail, so there is no inbox to check and no magic link to wait for.

Add your kids on `/parent`, give each one a PIN, and **set each kid's grade** —
it decides which questions they get. You only ever set it once: grades advance
themselves every August.

Set the **grown-up PIN** too. `/parent` sits behind it, and the elevation
expires on its own, so a kid who picks up the iPad gets the PIN screen instead
of your dashboard. Pick one your kids will not guess.

---

## Putting it online

Import the repo on [Vercel](https://vercel.com) and add the same environment
variables from `.env.local` in the project settings. It deploys on push.

Two things that will bite otherwise:

- **Vercel does not fetch Git LFS.** Authored art sources under `art/` are
  LFS-tracked; runtime assets under `public/` deliberately are not. If you ever
  add a runtime asset to LFS it will deploy as a ~130-byte pointer and break the
  build.
- Set `NEXT_PUBLIC_ENABLE_NEEDLE_TOWN=0` unless you know you want the
  experimental renderer.

## If something goes wrong

`node scripts/setup.mjs` is the first thing to run. It reports which step is
unhappy and what fixes it, rather than a stack trace.

- **"permission denied for table …"** — the tables exist without privileges.
  Re-apply the baseline; it grants explicitly and is safe to re-run.
- **Signup rejects your code** — codes are single-use. Run `setup.mjs` for a
  fresh one.
- **A paused project refuses connections.** Free-tier projects pause after a
  week idle; resume it from the dashboard.

## Getting later updates

Your kids' data — names, grades, tokens, every attempt, their tickets — lives in
your Supabase project, not in the code. Pulling an update cannot touch any of
it. Add upstream once:

```bash
git remote add upstream https://github.com/gwhale/open-gamecakes.git
git fetch upstream && git merge upstream/main
npx supabase db push
node scripts/setup.mjs
```

If you never edit the code, that is a fast-forward every time.
[docs/UPDATING.md](docs/UPDATING.md) covers what can conflict if you do, and how
to add your own games so it mostly doesn't.

## What you are allowed to do with this

MIT licensed: run it, change it, share it. The **name** Gamecakes, the
character Cakey and the logo are not covered — see `TRADEMARKS.md`. Run your own
copy under your own name and everyone stays out of trouble.
