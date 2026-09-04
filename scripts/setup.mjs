#!/usr/bin/env node
// One-command setup for a fresh Gamecakes install.
//
//   node scripts/setup.mjs
//
// Reads .env.local and gets you from "empty Supabase project" to "a parent can
// sign up and a kid can play". Safe to run repeatedly: every step checks before
// it acts, so a second run reports state rather than duplicating anything.
//
// It deliberately uses only the secret API key you already put in .env.local --
// no Supabase CLI, no database password, no Docker, no personal access token.
// The one thing it cannot do with that key is create tables, because the REST
// API cannot run DDL. When the schema is missing it says so and gives you the
// exact commands, rather than failing with a stack trace.

import { readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';

const ENV_PATH = '.env.local';

/* ── output helpers ──────────────────────────────────────────────────── */
const ok = (msg) => console.log(`  ok    ${msg}`);
const did = (msg) => console.log(`  done  ${msg}`);
const info = (msg) => console.log(`        ${msg}`);
const step = (msg) => console.log(`\n${msg}`);

/** Print an actionable failure and stop. Never a stack trace: whoever runs
 *  this is setting the project up for the first time and needs the next
 *  action, not a trace through node internals. */
function fail(what, ...fixLines) {
  console.error(`\n  PROBLEM  ${what}\n`);
  for (const line of fixLines) console.error(`           ${line}`);
  console.error('');
  process.exit(1);
}

/* ── 1. environment ──────────────────────────────────────────────────── */
step('1. Reading .env.local');

if (!existsSync(ENV_PATH)) {
  fail('.env.local does not exist.',
    'Copy the example and fill in your own Supabase project:',
    '',
    '  cp .env.example .env.local',
    '',
    'The two values this script needs are on your project dashboard under',
    'Project Settings -> API: the project URL and the SECRET key (sb_secret_...).');
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;

if (!URL_ || URL_.includes('your-project') || URL_.includes('placeholder')) {
  fail('NEXT_PUBLIC_SUPABASE_URL is missing or still a placeholder.',
    'Set it to your project URL, e.g. https://abcdefghijklm.supabase.co',
    'Project Settings -> API -> Project URL.');
}
if (!KEY || KEY.includes('your-key') || KEY.includes('placeholder')) {
  fail('SUPABASE_SECRET_KEY is missing or still a placeholder.',
    'Project Settings -> API -> Secret key (starts sb_secret_).',
    '',
    'This is the SERVER key. It bypasses row-level security, so it must never',
    'be committed or shipped to a browser. .env.local is already gitignored.');
}
ok(`project ${new URL(URL_).hostname.split('.')[0]}`);

/* ── REST helper ─────────────────────────────────────────────────────── */
async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.text() };
}

/* ── 2. reachability ─────────────────────────────────────────────────── */
step('2. Reaching your project');

let probe;
try {
  probe = await rest('skills?select=id&limit=1');
} catch (err) {
  fail(`Could not reach ${URL_}`,
    `(${err.message})`,
    'Check the URL is right and that you are online. A paused free-tier',
    'project also refuses connections -- resume it from the dashboard.');
}
if (probe.status === 401) {
  fail('Your project rejected the key (401).',
    'SUPABASE_SECRET_KEY does not match this project. Both values must come',
    'from the SAME project: Settings -> API.');
}
ok('reachable, key accepted');

/* ── 3. schema ───────────────────────────────────────────────────────── */
step('3. Checking the schema');

const TABLES = ['families', 'kids', 'skills', 'invite_codes', 'attempts', 'kid_tokens'];
const missing = [];
for (const t of TABLES) {
  const r = await rest(`${t}?select=*&limit=0`);
  if (r.status === 404 || /does not exist/.test(r.body)) missing.push(t);
}
if (missing.length) {
  fail(`The database has no schema yet (missing: ${missing.join(', ')}).`,
    'Apply the baseline, which builds every table in one file:',
    '',
    '  npx supabase login',
    '  npx supabase link --project-ref <your-project-ref>',
    '  npx supabase db push',
    '',
    'Your project ref is the subdomain of your project URL.',
    '',
    'No CLI? Open the SQL editor on your dashboard and paste the contents of',
    'supabase/migrations/0001_baseline.sql, then run this script again.');
}
ok(`all ${TABLES.length} core tables present`);

/* ── 4. skills catalog ───────────────────────────────────────────────── */
step('4. Checking the skills catalog');

// Read rows, distinguishing "the query failed" from "there are none". Worth
// the extra branch: during development this step reported an empty catalog
// when the real answer was HTTP 403 "permission denied for table skills",
// which sent the investigation in exactly the wrong direction. An error and
// an empty result are different facts and must not print the same message.
async function rows(path, what) {
  const { status, body } = await rest(path);
  if (status >= 300) {
    let detail = body.slice(0, 200);
    try {
      const e = JSON.parse(body);
      detail = e.message ?? detail;
      if (e.code === '42501') {
        fail(`The database refused to let the server read ${what} (permission denied).`,
          detail,
          e.hint ? `Postgres suggests: ${e.hint}` : '',
          '',
          'The tables exist but carry no privileges. That happens when the',
          'schema was created without the grants Supabase normally applies.',
          'Re-applying supabase/migrations/0001_baseline.sql fixes it -- the',
          'baseline grants explicitly and is safe to run again.');
      }
    } catch { /* body was not JSON; the raw slice above is the best detail */ }
    fail(`Could not read ${what} (HTTP ${status}).`, detail);
  }
  try {
    return JSON.parse(body);
  } catch {
    fail(`Unexpected response while reading ${what}.`, body.slice(0, 200));
  }
}

const skills = await rows('skills?select=id', 'the skills catalog');
if (skills.length === 0) {
  fail('The skills catalog is empty.',
    'Every game credits practice against a skill row, so nothing will record',
    'progress until these exist. They ship inside the baseline -- re-apply',
    'supabase/migrations/0001_baseline.sql, which is safe to run again.');
}
ok(`${skills.length} skills`);

/* ── 5. storage buckets ──────────────────────────────────────────────── */
step('5. Checking storage buckets');

// Parent observation photos and kid feedback attachments. Private: uploads and
// reads go through the server with the secret key, never straight from a
// browser. Unlike tables, buckets CAN be created with this key.
const WANT_BUCKETS = ['observations', 'feedback'];
const bRes = await fetch(`${URL_}/storage/v1/bucket`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const existing = bRes.ok ? (await bRes.json()).map((b) => b.name) : [];

for (const name of WANT_BUCKETS) {
  if (existing.includes(name)) { ok(`bucket "${name}"`); continue; }
  const created = await fetch(`${URL_}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: name, name, public: false }),
  });
  if (created.ok) did(`created private bucket "${name}"`);
  else info(`could not create bucket "${name}" (${created.status}) -- create it by hand, private, in Storage`);
}

/* ── 6. invite code ──────────────────────────────────────────────────── */
step('6. Making sure you can sign up');

// Signup is invite-only, so a brand-new install has no way in until a code
// exists. Shape must match generateInviteCode() in src/lib/auth/invite.ts:
// 'CAKE-' + 8 chars, alphabet excluding I/O/0/1 so a code read aloud to
// another parent cannot be mistyped. Duplicated rather than imported because
// this script has to run before the app is known to work.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'CAKE-' + Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');

const unredeemed = await rows('invite_codes?select=code&redeemed_at=is.null', 'invite codes');
let code;
if (unredeemed.length > 0) {
  code = unredeemed[0].code;
  ok(`an unused invite code already exists (${unredeemed.length} total)`);
} else {
  code = newCode();
  const created = await rest('invite_codes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ code, notes: 'Created by scripts/setup.mjs' }),
  });
  if (created.status >= 300) {
    fail(`Could not create an invite code (HTTP ${created.status}).`,
      created.body.slice(0, 300),
      '',
      'Without one, nobody can complete signup. You can insert a row into',
      "invite_codes by hand: code 'CAKE-XXXXXXXX', everything else null.");
  }
  did(`minted invite code ${code}`);
}

/* ── done ────────────────────────────────────────────────────────────── */
console.log(`
  ---------------------------------------------------------------
  Ready. Two things left, in this order:

    1. npm run dev

    2. Open http://localhost:3000/signup and enter

         invite code   ${code}
         your email    (a magic link is sent to it)
         family name   whatever you like

       Then click the link in your inbox, add your kids on /parent,
       and set each kid's grade -- it drives which questions they get.

  Notes
    * Grades advance themselves every August. Set them once.
    * SITE_PASSWORD in .env.local is the household gate, the outer wall
      before the kid picker. PARENT_ADMIN_PASSWORD gates /parent, and
      kids should not know it.
    * Re-running this script is safe. It checks before it acts.
  ---------------------------------------------------------------
`);
