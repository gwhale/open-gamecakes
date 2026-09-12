#!/usr/bin/env node
// scripts/admin/login-doctor.mjs — diagnose and repair a family login or kid PIN.
//
// There are TWO separate gates in Gamecakes and "I can't log in" can mean
// either one, so this tool covers both:
//
//   1. FAMILY LOGIN  /login — a login slug + password, mapped to a synthetic
//      Supabase Auth user (<slug>@gamecakes.family). See lib/auth/login-name.ts.
//   2. KID PIN       /kids/<id> — a 4-digit PIN stored in kids.pin.
//
// The login route deliberately returns one generic "Wrong login or password."
// for every failure so it can't be used to enumerate accounts. That is right
// for the public internet and useless for a parent locked out of their own
// house, which is what this script is for: run it locally and it will tell you
// what the website won't.
//
// Usage:
//   node scripts/admin/login-doctor.mjs list
//   node scripts/admin/login-doctor.mjs reset <login> [--password=...]
//   node scripts/admin/login-doctor.mjs kid-pin [<kid name>] [--pin=1234|--clear]
//
// `reset` with no --password generates a fresh one and prints it once; that
// keeps the password out of your shell history, which is the safer default.
//
// Reads ../../.env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY.
// The secret key is an admin credential — run this on your own machine, never
// in CI, and never paste its output anywhere public.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env.local');

let envText;
try {
  envText = readFileSync(envPath, 'utf8');
} catch {
  console.error(`✗ Could not read ${envPath}`);
  console.error('  Copy .env.example to .env.local and fill in your Supabase keys.');
  process.exit(1);
}
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((l) => !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
if (!URL_BASE || !KEY) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const SYNTHETIC_DOMAIN = 'gamecakes.family';
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

// Mirrors normalizeLoginName in src/lib/auth/login-name.ts. Kept in sync by
// hand because this script has no build step and must run with plain node.
const SLUG_RE = /^[a-z0-9](-?[a-z0-9])+$/;
function normalizeLoginName(raw) {
  const cleaned = String(raw ?? '').trim().toLowerCase();
  if (cleaned.length < 3 || cleaned.length > 20) return null;
  if (!SLUG_RE.test(cleaned)) return null;
  return cleaned;
}

async function listAuthUsers() {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
  if (!res.ok) {
    console.error(`✗ Could not list users: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = await res.json();
  return body.users ?? [];
}

async function listKids() {
  const res = await fetch(`${URL_BASE}/rest/v1/kids?select=id,name,pin`, { headers });
  if (!res.ok) {
    console.error(`✗ Could not list kids: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(
  rest.filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }),
);
const positional = rest.filter((a) => !a.startsWith('--'));

if (cmd === 'list' || !cmd) {
  const users = await listAuthUsers();
  const families = users.filter((u) => (u.email ?? '').endsWith(`@${SYNTHETIC_DOMAIN}`));
  console.log('');
  console.log(`  FAMILY LOGINS (${families.length})`);
  if (families.length === 0) {
    console.log('    (none — no family has signed up yet on this Supabase project)');
  }
  for (const u of families) {
    const slug = u.email.slice(0, u.email.lastIndexOf('@'));
    const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString().slice(0, 16) : 'never';
    console.log(`    ${slug.padEnd(22)} created ${String(u.created_at).slice(0, 10)}   last login ${last}`);
  }
  const other = users.length - families.length;
  if (other > 0) console.log(`    (+ ${other} non-family auth user${other === 1 ? '' : 's'})`);

  const kids = await listKids();
  console.log('');
  console.log(`  KID PROFILES (${kids.length})`);
  for (const k of kids) {
    console.log(`    ${String(k.name).padEnd(22)} ${k.pin ? `PIN set (${String(k.pin).length} digits)` : 'no PIN — taps straight in'}`);
  }
  console.log('');
  console.log('  Locked out? Reset the family password:');
  console.log('    node scripts/admin/login-doctor.mjs reset <login>');
  console.log('  Forgotten kid PIN:');
  console.log('    node scripts/admin/login-doctor.mjs kid-pin "<kid name>" --pin=1234');
  console.log('');
  process.exit(0);
}

if (cmd === 'reset') {
  const login = normalizeLoginName(positional[0]);
  if (!login) {
    console.error('✗ Give a valid family login: 3–20 lowercase letters, numbers or hyphens.');
    console.error(`  "${positional[0] ?? ''}" is not one — note that spaces and punctuation are rejected,`);
    console.error('  which is itself a common cause of "my password stopped working".');
    process.exit(1);
  }
  const users = await listAuthUsers();
  const user = users.find((u) => u.email === `${login}@${SYNTHETIC_DOMAIN}`);
  if (!user) {
    console.error(`✗ No family login "${login}" exists on this project.`);
    console.error('  Run `node scripts/admin/login-doctor.mjs list` to see what does.');
    console.error('  If the list is empty, signup never completed — start again at /signup.');
    process.exit(1);
  }
  // Supabase enforces its own minimum password length (6 by default, set per
  // project under Auth → Policies). Generate comfortably past it.
  const password = typeof flags.password === 'string'
    ? flags.password
    : `cake-${randomBytes(3).toString('hex')}-${randomBytes(2).toString('hex')}`;

  const res = await fetch(`${URL_BASE}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`✗ Reset failed: ${res.status} ${text}`);
    if (text.toLowerCase().includes('password')) {
      console.error('  Supabase rejected the password itself — it is below your project’s');
      console.error('  minimum length (Auth → Policies). Try a longer one.');
    }
    process.exit(1);
  }
  console.log('');
  console.log(`  ✓ Password reset for "${login}"`);
  console.log('');
  console.log(`    login:     ${login}`);
  console.log(`    password:  ${password}`);
  console.log('');
  console.log('  Log in at gamecakes.org/login. Change it from the parent area when you are back in.');
  console.log('');
  process.exit(0);
}

if (cmd === 'kid-pin') {
  const kids = await listKids();
  const name = positional[0];
  if (!name) {
    console.log('');
    for (const k of kids) console.log(`    ${String(k.name).padEnd(22)} ${k.pin ?? '(no PIN)'}`);
    console.log('');
    console.log('  Set one with: --pin=1234    Remove it with: --clear');
    console.log('');
    process.exit(0);
  }
  const kid = kids.find((k) => String(k.name).toLowerCase() === name.toLowerCase());
  if (!kid) {
    console.error(`✗ No kid named "${name}". Found: ${kids.map((k) => k.name).join(', ') || '(none)'}`);
    process.exit(1);
  }
  if (!flags.pin && !flags.clear) {
    console.log('');
    console.log(`    ${kid.name}'s PIN: ${kid.pin ?? '(none — taps straight in)'}`);
    console.log('');
    process.exit(0);
  }
  const nextPin = flags.clear ? null : String(flags.pin);
  if (nextPin !== null && !/^\d{4}$/.test(nextPin)) {
    console.error('✗ A PIN must be exactly 4 digits.');
    process.exit(1);
  }
  const res = await fetch(`${URL_BASE}/rest/v1/kids?id=eq.${kid.id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ pin: nextPin }),
  });
  if (!res.ok) {
    console.error(`✗ Update failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log('');
  console.log(nextPin === null
    ? `  ✓ ${kid.name} no longer needs a PIN.`
    : `  ✓ ${kid.name}'s PIN is now ${nextPin}.`);
  console.log('');
  process.exit(0);
}

console.error(`✗ Unknown command "${cmd}".`);
console.error('  Try: list | reset <login> | kid-pin [<name>]');
process.exit(1);
