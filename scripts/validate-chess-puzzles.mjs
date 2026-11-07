// Validate the chess puzzle library (library.json) with chess.js.
//   node scripts/validate-chess-puzzles.mjs
//
// For every puzzle: the FEN loads, every UCI move in the line is legal played
// in sequence, and a 'mate' puzzle ends in checkmate. Exits non-zero on any
// failure and prints the first few offenders + a per-rating-bucket count.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';

const LIB = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'components', 'games', 'chess-puzzles', 'library.json',
);
const lib = JSON.parse(readFileSync(LIB, 'utf8'));

let ok = 0;
let bad = 0;
const buckets = {};

for (let i = 0; i < lib.length; i++) {
  const p = lib[i];
  const g = new Chess();
  let valid = true;
  let reason = '';

  try {
    g.load(p.f);
  } catch {
    valid = false;
    reason = 'bad FEN';
  }

  if (valid) {
    for (const uci of p.m) {
      const mv = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
      if (uci.length > 4) mv.promotion = uci[4];
      try {
        if (!g.move(mv)) { valid = false; reason = `illegal ${uci}`; break; }
      } catch {
        valid = false;
        reason = `illegal ${uci}`;
        break;
      }
    }
  }

  if (valid && p.k === 'mate' && !g.isCheckmate()) { valid = false; reason = 'not checkmate'; }

  if (valid) {
    ok++;
    const b = Math.floor(p.r / 100) * 100;
    buckets[b] = (buckets[b] || 0) + 1;
  } else {
    bad++;
    if (bad <= 10) console.error(`BAD [${i}] r${p.r} ${p.k}: ${reason} — ${p.f} | ${p.m.join(' ')}`);
  }
}

console.log('Rating buckets:', JSON.stringify(buckets));
console.log(`${ok} OK, ${bad} BAD of ${lib.length}`);
if (bad > 0) process.exit(1);
console.log('ALL PUZZLES OK');
