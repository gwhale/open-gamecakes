#!/usr/bin/env node
// Apply the DML portion of supabase/migrations/0012_remove_pins_add_guest.sql
// via the Supabase service-role client.
//
// Unlike scripts/apply-sql.mjs (which uses the Management API and needs an
// sbp_* personal access token), this one runs two targeted writes through
// PostgREST using the SUPABASE_SECRET_KEY already in .env.local. It only
// works because 0012 is pure DML — no ALTER TABLE, CREATE TABLE, etc.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Load .env.local manually (no dep). Format: KEY=value per line.
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(2);
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Null PINs on the real kids.
const { error: e1 } = await sb
  .from('kids')
  .update({ pin: null })
  .in('id', [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]);
if (e1) { console.error('step 1 failed:', e1.message); process.exit(1); }
console.log('step 1: PINs nulled ✓');

// 2. Upsert Guest profile.
const { error: e2 } = await sb
  .from('kids')
  .upsert(
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Guest',
      avatar: '🎯',
      pin: null,
    },
    { onConflict: 'id' },
  );
if (e2) { console.error('step 2 failed:', e2.message); process.exit(1); }
console.log('step 2: Guest profile upserted ✓');

console.log('migration 0012 applied');
