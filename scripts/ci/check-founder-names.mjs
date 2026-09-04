// Fails the build if a protected name reaches public-facing prose.
//
// The names themselves are NOT in this file. They live in
// scripts/ci/protected-names.json, which is the only place they appear, which
// is what lets this script be generic — and shippable in a public repository
// without carrying the very names it exists to keep out.
//
// No config file? The check is a no-op and exits 0. That is the correct
// behaviour for a fresh clone: a family running their own copy has no names to
// protect until they say otherwise, and can create the file with their own.
//
// THE TRICK, and why this needs almost no allowlist: matching is
// CASE-SENSITIVE on a word boundary, and this codebase already spells a person
// differently from an identifier.
//
// Illustrated with an invented name, for obvious reasons:
//
//     prose      Robin              <- matched, and banned
//     slug       robin-maze         <- lowercase, never matches
//     constant   ROBIN_MAZE         <- uppercase, never matches
//
// Only CamelCase symbols share the capitalised form, and those are listed in
// the config's "identifiers".
//
// Usage:  node scripts/ci/check-founder-names.mjs   (npm run check:names)
// Exit 0 = clean, 1 = a name reached prose.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const CONFIG = 'scripts/ci/protected-names.json';

if (!existsSync(CONFIG)) {
  console.log(`founder-name check: no ${CONFIG}, nothing to protect (ok)`);
  process.exit(0);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (err) {
  console.error(`founder-name check: ${CONFIG} is not valid JSON — ${err.message}`);
  process.exit(1);
}

const names = (config.names ?? []).filter(Boolean);
if (names.length === 0) {
  console.log(`founder-name check: no names configured in ${CONFIG} (ok)`);
  process.exit(0);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAMES = new RegExp(`\\b(${names.map(escape).join('|')})\\b`, 'g');
const IDENTIFIERS = (config.identifiers ?? []).map((p) => new RegExp(p, 'g'));

// The config holds the names by definition, so it cannot scan itself. Any
// further exemption is declared IN the config, with its reason, rather than
// buried in this script — that is how a file quietly excused itself from the
// check once before.
const EXEMPT = [
  new RegExp(`^${escape(CONFIG)}$`),
  ...(config.exempt ?? []).map((p) => new RegExp(p)),
];

const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|mp4|webm|glb|gltf|ktx2|hdr|exr|blend|woff2?|ttf|otf|pdf|zip)$/i;

// Tracked files AND new ones that are not gitignored. `git ls-files` alone
// lists only tracked files, so a brand-new file is invisible locally right up
// until it is committed — which meant a clean local run and a failing CI run on
// the very same tree.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !BINARY.test(f))
  .filter((f) => !EXEMPT.some((re) => re.test(f)));

const hits = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }

  // A path can carry a name even when the contents do not.
  let scrubbedPath = file;
  for (const re of IDENTIFIERS) scrubbedPath = scrubbedPath.replace(re, '');
  if (scrubbedPath.match(NAMES)) hits.push({ file, line: 0, text: `(filename) ${file}` });

  text.split(/\r?\n/).forEach((line, i) => {
    let scrubbed = line;
    for (const re of IDENTIFIERS) scrubbed = scrubbed.replace(re, '');
    if (NAMES.test(scrubbed)) hits.push({ file, line: i + 1, text: line.trim() });
    NAMES.lastIndex = 0;
  });
}

if (hits.length === 0) {
  console.log(`founder-name check: clean (${files.length} files scanned)`);
  process.exit(0);
}

console.error(`\nfounder-name check FAILED - ${hits.length} occurrence(s) in prose:\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}`);
  console.error(`    ${h.text.slice(0, 120)}`);
}
console.error(`
These are real children. If the hit is a live identifier that cannot be renamed
yet, add a pattern to "identifiers" in ${CONFIG} with a reason. Otherwise
rewrite the prose.
`);
process.exit(1);
