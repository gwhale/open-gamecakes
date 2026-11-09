#!/usr/bin/env node
// Creates the login for /admin: an account that belongs to no family.
//
//   node scripts/admin/create-operator.mjs <login>
//
// Prints the user id and a generated password once. Put the id in
// SUPER_ADMIN_USER_IDS on the deployment. Sign in at /admin/login.
// `login-doctor.mjs reset <login>` changes the password later.
//
// Reads ../../.env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY.

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!base || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

// The same shape normalizeLoginName accepts in src/lib/auth/login-name.ts.
const login = String(process.argv[2] ?? '').trim().toLowerCase();
if (login.length < 3 || login.length > 20 || !/^[a-z0-9](-?[a-z0-9])+$/.test(login)) {
  console.error('Usage: node scripts/admin/create-operator.mjs <login>');
  console.error('3-20 letters, numbers and single hyphens.');
  process.exit(1);
}

const password = randomBytes(18).toString('base64url');
const res = await fetch(`${base}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `${login}@gamecakes.family`, password, email_confirm: true }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`Could not create ${login}: ${body.msg ?? body.message ?? res.status}`);
  process.exit(1);
}
console.log(`SUPER_ADMIN_USER_IDS=${body.id}`);
console.log(`login: ${login}`);
console.log(`password: ${password}`);
