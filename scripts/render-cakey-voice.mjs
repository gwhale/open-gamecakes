// Render Cakey's spoken lines to audio, once, at build time.
//
// WHY BUILD TIME AND NOT RUNTIME
// Cakey does not improvise — every line he says is authored in cakey-lines.ts.
// Rendering them live would put an API key in the running app, add a network
// round trip before he can speak, cost money on every tap, and leave him mute
// whenever the provider hiccups or the iPad's wifi drops. Rendering once and
// committing the audio costs about $1.65 for the whole corpus, forever.
//
// CONTENT-ADDRESSED CACHE
// Each clip is named for a hash of its own text, so re-running this is cheap:
// unchanged lines already exist on disk and are skipped. Edit a line and only
// that line re-renders, under a new name. The old file becomes orphaned and can
// be pruned with --prune.
//
//   ELEVENLABS_API_KEY=... node --experimental-strip-types //     --import ./scripts/ts-resolve.mjs scripts/render-cakey-voice.mjs [--prune]
//
// The --import hook is required: story-events.ts calls findRegion() at runtime,
// so it needs the `@/` alias and extensionless relative imports resolved the way
// the bundler does.
//
// The key is needed ONLY here, by whoever regenerates audio. It never reaches
// the app bundle or the browser.

import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// cakey-lines.ts has only `import type` statements, which type-stripping erases
// outright — so this imports the REAL module rather than regex-scraping it, and
// cannot drift from what the app actually says.
import {
  AMBIENT_LINES,
  DAD_JOKES,
  HELLO_LINES,
  NOTICE_PLAYER_LINES,
  SOCKS_AND_SHOES_LINES,
  TRIVIA_INTRO_LINES,
  WEATHER_LINES,
} from '../src/lib/town/cakey-lines.ts';
// story-events.ts has a REAL runtime import (findRegion), so it needs the
// resolve hook — run this script with `--import ./scripts/ts-resolve.mjs`.
import { STORY_EVENTS } from '../src/lib/town/story-events.ts';
// Spelling questions are asked out loud — the word is deliberately NOT printed,
// because printing it turns a listening task into a matching one. Reading the
// list from the real module means a word added to the content library gets a
// clip on the next run rather than falling through to the browser voice
// forever, unnoticed.
import { spellingSpokenWords } from '../src/lib/games/shared/generate-reading-challenge.ts';
import { hashLine } from '../src/lib/town/hash-line.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'voice', 'cakey');
const MANIFEST = join(ROOT, 'src', 'lib', 'town', 'cakey-voice-manifest.json');

/** Sponge — designed for Cakey, saved 2026-07-26. Dry, deadpan, warm. */
const VOICE_ID = 'AqJ38ywUneEKK8QIY4tE';
const MODEL = 'eleven_multilingual_v2';
// Stability high enough that repeated listens don't drift, style low because
// the character IS flat — pushing style makes him theatrical, which fights the
// writing.
const SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.15 };

// hashLine is imported, not copied. The browser resolves a clip by hashing the
// same string this names the file with; when those were two implementations,
// any divergence silently muted every line instead of failing loudly.

function collectLines() {
  const out = new Set();
  for (const l of AMBIENT_LINES) out.add(l);
  for (const l of HELLO_LINES) out.add(l);
  for (const l of NOTICE_PLAYER_LINES) out.add(l);
  for (const l of TRIVIA_INTRO_LINES) out.add(l);
  for (const l of SOCKS_AND_SHOES_LINES) out.add(l);
  // Story cutscene narration: title, blurb and every beat. Same voice, same
  // pipeline — a beat is just another authored line.
  for (const st of STORY_EVENTS) {
    out.add(st.title);
    out.add(st.blurb);
    for (const b of st.beats) out.add(b);
  }
  for (const arr of Object.values(WEATHER_LINES)) for (const l of arr) out.add(l);
  // Setup and punchline are separate clips on purpose: the panel makes a kid tap
  // "…go on" between them, and the pause is the joke.
  for (const j of DAD_JOKES) {
    if (j.setup) out.add(j.setup);
    if (j.punchline) out.add(j.punchline);
  }
  // Single spelling words. Short and cheap — the whole set is a fraction of one
  // story beat — and they are the only clips where MISSING audio changes what
  // the question is asking rather than just how it sounds.
  for (const w of spellingSpokenWords()) out.add(w);
  return [...out].filter((l) => typeof l === 'string' && l.trim().length > 0);
}

/** Render one line AND capture when each word is spoken.
 *
 *  The /with-timestamps variant returns per-CHARACTER start times alongside the
 *  audio. Those get folded up into per-WORD times here, at build time, so the
 *  browser never has to do it — and so the word list the runtime highlights is
 *  the exact list this script derived, rather than two split() calls that might
 *  disagree about punctuation or a curly apostrophe. */
async function render(text, key) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const audio = Buffer.from(json.audio_base64, 'base64');

  const chars = json.alignment?.characters ?? [];
  const starts = json.alignment?.character_start_times_seconds ?? [];
  const ends = json.alignment?.character_end_times_seconds ?? starts;
  const words = [];
  const times = [];
  let cur = '';
  let curStart = 0;
  let curEnd = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    if (/\s/.test(c)) {
      if (cur) { words.push(cur); times.push([curStart, curEnd]); cur = ''; }
    } else {
      if (!cur) curStart = starts[i] ?? 0;
      cur += c;
      curEnd = ends[i] ?? starts[i] ?? curEnd;
    }
  }
  if (cur) { words.push(cur); times.push([curStart, curEnd]); }
  return { audio, words, times };
}

const lines = collectLines();
const wanted = new Map(lines.map((l) => [hashLine(l), l]));
mkdirSync(OUT_DIR, { recursive: true });

const round = (n) => Math.round(n * 100) / 100;
// Word timings survive across runs so a cached clip keeps its highlighting.
const prevManifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
// Tolerates the original array-shaped manifest: it simply carries no timings,
// so those lines re-render once and gain them.
const timings = (prevManifest && !Array.isArray(prevManifest) && prevManifest.timings) || {};
const missing = [...wanted].filter(
  ([h]) => !existsSync(join(OUT_DIR, `${h}.mp3`)) || !timings[h],
);
console.log(`${lines.length} lines · ${wanted.size - missing.length} cached · ${missing.length} to render`);

if (missing.length > 0) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error('ELEVENLABS_API_KEY is not set — cannot render the missing lines.');
    console.error('Audio already on disk is untouched; re-run with the key to fill the gaps.');
    process.exit(1);
  }
  let done = 0;
  for (const [h, text] of missing) {
    try {
      const { audio, words, times } = await render(text, key);
      writeFileSync(join(OUT_DIR, `${h}.mp3`), audio);
      timings[h] = { w: words, t: times.map(([a, b]) => [round(a), round(b)]) };
      done += 1;
      console.log(`  [${done}/${missing.length}] ${h}  ${text.slice(0, 52)}`);
    } catch (err) {
      // Keep going: one failed line should not cost the whole run. It simply
      // stays out of the manifest and falls back to browser speech at runtime.
      console.warn(`  FAILED ${h}: ${err.message}`);
    }
  }
}

// The manifest lists only hashes that ACTUALLY have a file, so the runtime never
// points at a clip that failed to render.
const present = [...wanted.keys()].filter((h) => existsSync(join(OUT_DIR, `${h}.mp3`)));
const kept = Object.fromEntries(present.filter((h) => timings[h]).map((h) => [h, timings[h]]));
const manifestJson = JSON.stringify({ clips: present.sort(), timings: kept }, null, 2);
writeFileSync(MANIFEST, manifestJson + String.fromCharCode(10));
console.log(`manifest: ${present.length} clips, ${Object.keys(kept).length} with word timings`);

if (process.argv.includes('--prune')) {
  const keep = new Set(present.map((h) => `${h}.mp3`));
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.mp3') && !keep.has(f)) {
      unlinkSync(join(OUT_DIR, f));
      console.log(`  pruned orphan ${f}`);
    }
  }
}
