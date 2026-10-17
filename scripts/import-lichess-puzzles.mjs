// Import + curate a kid-appropriate slice of the lichess open puzzle DB.
//
// Source: https://database.lichess.org/lichess_db_puzzle.csv.zst  (CC0, ~6M puzzles)
// Columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
//
// The lichess format maps onto our game: FEN is the position BEFORE the
// opponent's move, Moves[0] is the opponent's setup move (our oppMove), and
// Moves[1..] is the solution line (kid, opp, kid, …). Rating is the difficulty.
//
// We STREAM the .zst through Node's built-in zstd decompressor (Node ≥22.15 /
// v24 has zlib.createZstdDecompress — no zstd CLI needed), filter to short,
// well-liked, instructive puzzles across a kid rating range, bucket by rating
// for an even difficulty ramp, re-validate every kept line with chess.js, and
// emit a compact library.json. We abort the download as soon as the buckets
// are full, so we never pull the whole 300MB file.
//
// Run: node scripts/import-lichess-puzzles.mjs

import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';

const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'games', 'chess-puzzles', 'library.json');

const RATING_MIN = 500;
const RATING_MAX = 1900;
const BUCKET = 100; // rating bucket width
const PER_BUCKET = 350; // keep up to this many per bucket → ~4.9k total
const POP_MIN = 80; // Popularity is -100..100; well-liked only
const PLAYS_MIN = 500; // well-tested puzzles only
const MAX_PLIES = 7; // Moves length: oppMove + ≤6 solution plies (kid plays ≤3)
const MAX_ROWS = 1_500_000; // safety cap on rows streamed

// Instructive, kid-teachable themes. A puzzle must carry at least one.
const GOOD_THEMES = new Set([
  'mateIn1', 'mateIn2', 'mateIn3',
  'fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack', 'doubleCheck',
  'sacrifice', 'deflection', 'attraction', 'clearance', 'interference',
  'trappedPiece', 'backRankMate', 'smotheredMate', 'promotion', 'capturingDefender',
]);
const MATE_THEMES = new Set(['mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate']);

// The lichess .zst starts with a zstd *skippable frame* (magic 0x184D2A5x +
// a 4-byte size + payload) that Node's zstd decoder rejects ("Unknown frame
// descriptor"). Strip a leading skippable frame from the stream before the
// real frame (0xFD2FB528) so createZstdDecompress sees a clean frame.
function stripLeadingSkippable() {
  let done = false;
  let head = Buffer.alloc(0);
  return new Transform({
    transform(chunk, _enc, cb) {
      if (done) return cb(null, chunk);
      head = Buffer.concat([head, chunk]);
      if (head.length < 8) return cb();
      const magic = head.readUInt32LE(0);
      if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
        const total = 8 + head.readUInt32LE(4);
        if (head.length < total) return cb(); // wait for the whole skippable frame
        done = true;
        const rest = head.subarray(total);
        head = Buffer.alloc(0);
        return rest.length ? cb(null, rest) : cb();
      }
      done = true; // no skippable frame — pass through
      const out = head;
      head = Buffer.alloc(0);
      return cb(null, out);
    },
  });
}

const bucketIndex = (r) => Math.floor((r - RATING_MIN) / BUCKET);
const nBuckets = Math.ceil((RATING_MAX - RATING_MIN) / BUCKET);
const buckets = Array.from({ length: nBuckets }, () => []);
const bucketFull = (i) => buckets[i].length >= PER_BUCKET;
const allFull = () => buckets.every((b) => b.length >= PER_BUCKET);

// Validate a full line with chess.js: every move legal from the FEN; a mate
// puzzle must actually end in checkmate.
function validate(fen, moves, isMate) {
  const g = new Chess();
  try {
    g.load(fen);
  } catch {
    return false;
  }
  for (const uci of moves) {
    const move = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
    if (uci.length > 4) move.promotion = uci[4];
    try {
      if (!g.move(move)) return false;
    } catch {
      return false;
    }
  }
  if (isMate && !g.isCheckmate()) return false;
  return true;
}

const ac = new AbortController();
let rows = 0;
let kept = 0;
let seenHeader = false;
const t0 = Date.now();

console.log('Streaming lichess puzzle DB (aborting once buckets fill)…');
const res = await fetch(URL, { signal: ac.signal });
if (!res.ok || !res.body) {
  console.error('Fetch failed:', res.status, res.statusText);
  process.exit(1);
}

const src = Readable.fromWeb(res.body);
src.on('error', () => {}); // swallow the AbortError we trigger when buckets fill
const decompressed = src
  .pipe(stripLeadingSkippable())
  .pipe(zlib.createZstdDecompress({ params: { [zlib.constants.ZSTD_d_windowLogMax]: 31 } }));
decompressed.on('error', () => {});
const rl = readline.createInterface({ input: decompressed, crlfDelay: Infinity });

try {
  for await (const line of rl) {
    if (!seenHeader) { seenHeader = true; continue; } // skip CSV header
    rows++;
    if (rows % 100000 === 0) {
      const filled = buckets.filter((b) => b.length >= PER_BUCKET).length;
      console.log(`  …${rows.toLocaleString()} rows · kept ${kept} · buckets full ${filled}/${nBuckets}`);
    }
    if (rows > MAX_ROWS) break;

    // FEN/Moves/Themes contain spaces but never commas → plain split is safe.
    const f = line.split(',');
    if (f.length < 8) continue;
    const fen = f[1];
    const moves = f[2].split(' ');
    const rating = Number(f[3]);
    const popularity = Number(f[5]);
    const nbPlays = Number(f[6]);
    const themes = f[7] ? f[7].split(' ') : [];

    if (!Number.isFinite(rating) || rating < RATING_MIN || rating >= RATING_MAX) continue;
    if (popularity < POP_MIN || nbPlays < PLAYS_MIN) continue;
    if (moves.length < 2 || moves.length > MAX_PLIES) continue;
    if (!themes.some((t) => GOOD_THEMES.has(t))) continue;

    const bi = bucketIndex(rating);
    if (bi < 0 || bi >= nBuckets || bucketFull(bi)) continue;

    const isMate = themes.some((t) => MATE_THEMES.has(t));
    if (!validate(fen, moves, isMate)) continue;

    buckets[bi].push({ f: fen, m: moves, r: rating, k: isMate ? 'mate' : 'tactic' });
    kept++;
    if (allFull()) { console.log('  all buckets full — stopping.'); break; }
  }
} finally {
  rl.close();
  ac.abort();
}

const all = buckets.flat();
writeFileSync(OUT_PATH, JSON.stringify(all));
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\nDone in ${secs}s. Streamed ${rows.toLocaleString()} rows, kept ${all.length} puzzles.`);
console.log('Per-bucket counts:', buckets.map((b, i) => `${RATING_MIN + i * BUCKET}:${b.length}`).join('  '));
console.log('Wrote', OUT_PATH, `(${(JSON.stringify(all).length / 1024).toFixed(0)} KB)`);
