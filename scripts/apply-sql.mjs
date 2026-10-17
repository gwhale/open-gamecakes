#!/usr/bin/env node
// Apply a SQL file to a Supabase project via the Management API.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... \
//   SUPABASE_PROJECT_REF=<your-project-ref> \
//   node scripts/apply-sql.mjs supabase/migrations/0001_init.sql
//
// Phase-1 expedient: we use the Management API's /database/query endpoint
// instead of the Supabase CLI + `db push`, because the CLI also needs the
// Postgres DB password and this endpoint accepts just the account access
// token. Switch to `supabase db push` once migrations become frequent and
// we want the CLI's migration-tracking table.

import { readFileSync } from 'node:fs';

const [ , , sqlPath ] = process.argv;
if (!sqlPath) {
  console.error('usage: node scripts/apply-sql.mjs <path-to-sql-file>');
  process.exit(2);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref   = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set');
  process.exit(2);
}

const sql = readFileSync(sqlPath, 'utf8');
const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`);
  console.error(text);
  process.exit(1);
}

console.log(`OK (${sqlPath})`);
console.log(text);
