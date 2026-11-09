#!/usr/bin/env node
// scripts/admin/create-invite.mjs — generate an invite code for closed beta.
//
// Usage:
//   node scripts/admin/create-invite.mjs "Sarah from school"
//   node scripts/admin/create-invite.mjs "Alex testers" --expires-days=14
//   node scripts/admin/create-invite.mjs "seeded household" --claim-family=<uuid>
//
// Reads ../../.env.local for Supabase credentials. Inserts a fresh
// invite code with the given notes; prints the code to stdout so you
// can copy + paste it into a text/email to share.
//
// Generated codes are single-use and gate access to /signup. Without
// one, no new family can register — that's the whole point of closed
// beta.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env.local');
const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((l) => !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
let notes = null;
// Adopting an existing household is a GRANT, not something a signer-up can
// reach by guessing a family name (migration 0052). Pass the uuid on purpose,
// or leave it off — which is the normal case.
let claimFamilyId = null;
let expiresDays = null;
for (const a of args) {
  if (a.startsWith('--claim-family=')) {
    claimFamilyId = a.slice('--claim-family='.length).trim();
    if (!/^[0-9a-f-]{36}$/i.test(claimFamilyId)) {
      console.error('✗ --claim-family must be a family uuid');
      process.exit(1);
    }
  } else if (a.startsWith('--expires-days=')) {
    expiresDays = parseInt(a.slice('--expires-days='.length), 10);
    if (!Number.isFinite(expiresDays) || expiresDays < 1) {
      console.error('✗ --expires-days must be a positive integer');
      process.exit(1);
    }
  } else if (!notes) {
    notes = a;
  }
}

// Generate code (matches src/lib/auth/invite.ts CODE_PREFIX + 8 base32 chars)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const buf = randomBytes(8);
let body = '';
for (let i = 0; i < 8; i++) body += ALPHABET[buf[i] % ALPHABET.length];
const code = `CAKE-${body}`;

const expiresAt = expiresDays
  ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
  : null;

// Insert via Supabase REST
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};
const res = await fetch(`${URL}/rest/v1/invite_codes`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ code, notes, expires_at: expiresAt, claim_family_id: claimFamilyId }),
});

if (!res.ok) {
  console.error(`✗ Insert failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log('');
console.log(`  invite code:  ${code}`);
console.log(`  notes:        ${notes ?? '(none)'}`);
console.log(`  claims family: ${claimFamilyId ?? '(none — creates a new one)'}`);
console.log(`  expires:      ${expiresAt ?? 'never'}`);
console.log('');
console.log('  Share with:');
console.log(`    ${URL.replace('https://', 'https://').replace('.supabase.co', '')}`);
console.log(`    "use code ${code} at gamecakes.org/signup"`);
console.log('');
