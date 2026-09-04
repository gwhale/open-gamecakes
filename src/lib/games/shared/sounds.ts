// Synthesized game sound effects via Web Audio API.
//
// No audio files needed — all sounds are generated with oscillators and
// gain envelopes. Lazy-init AudioContext on first call (browser autoplay
// policy requires a user gesture before audio can start).
//
// Every play* function is fire-and-forget: call it, sound plays, no cleanup.
// Gated on a persisted mute toggle (localStorage key STORAGE_KEY) — if the
// user has muted, play* calls no-op without touching the AudioContext.
// The toggle state is also broadcast via a tiny event bus so the
// SoundToggle button in the UI can react to programmatic changes
// (e.g. future "mute during dinner hours" feature).

let ctx: AudioContext | null = null;

// ---------------------------------------------------------------------------
// Mute toggle — persists per-device via localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'lw_sound_enabled';
const listeners = new Set<(enabled: boolean) => void>();
/** In-memory cache for SSR safety + fast reads in the game loop. */
let cached: boolean | null = null;

function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  if (cached !== null) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw === null ? true : raw === '1';
  } catch {
    cached = true;
  }
  return cached;
}

export function isSoundEnabled(): boolean {
  return readStored();
}

export function setSoundEnabled(next: boolean): void {
  cached = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // storage full / disabled — in-memory value is authoritative
    }
  }
  for (const fn of listeners) fn(next);
}

/** Subscribe to mute-state changes. Returns an unsubscribe fn. */
export function subscribeSound(fn: (enabled: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function osc(
  ac: AudioContext,
  type: OscillatorType,
  freq: number,
  startTime: number,
  duration: number,
  gain: number,
  freqEnd?: number,
) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, startTime);
  if (freqEnd !== undefined) {
    o.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
  }
  g.gain.setValueAtTime(gain, startTime);
  g.gain.linearRampToValueAtTime(0, startTime + duration);
  o.connect(g).connect(ac.destination);
  o.start(startTime);
  o.stop(startTime + duration);
}

/** Brief noise burst — used for splashes and whooshes. */
function noise(
  ac: AudioContext,
  startTime: number,
  duration: number,
  gain: number,
  bandpass?: { freq: number; q: number },
) {
  const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, startTime);
  g.gain.linearRampToValueAtTime(0, startTime + duration);
  if (bandpass) {
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = bandpass.freq;
    f.Q.value = bandpass.q;
    src.connect(f).connect(g).connect(ac.destination);
  } else {
    src.connect(g).connect(ac.destination);
  }
  src.start(startTime);
  src.stop(startTime + duration);
}

/** Run `play` only if sound is enabled. Keeps every exported helper
 *  a one-liner without a repeated `if (!isSoundEnabled()) return;` guard. */
function withToggle(play: () => void): () => void {
  return () => {
    if (!isSoundEnabled()) return;
    play();
  };
}

// ---------------------------------------------------------------------------
// Game sounds
// ---------------------------------------------------------------------------

/** Tap on a cell (short click/bloop). */
export const playTap = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sine', 600, t, 0.06, 0.15, 400);
});

/** Minnow caught — satisfying chomp + rising tone. */
export const playCatch = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'square', 200, t, 0.08, 0.2, 80);
  osc(ac, 'sine', 523, t + 0.08, 0.12, 0.15, 784);
  osc(ac, 'sine', 784, t + 0.18, 0.15, 0.12, 1047);
});

/** Wrong answer — fish escapes with a splash/whoosh. */
export const playEscape = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sawtooth', 400, t, 0.15, 0.12, 150);
  osc(ac, 'triangle', 300, t + 0.05, 0.2, 0.1, 100);
});

/** Minnow hops to a new cell — subtle bubble pop. */
export const playHop = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sine', 800, t, 0.04, 0.06, 1200);
});

/** Timer warning tick (last 30s). */
export const playTick = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'square', 1000, t, 0.03, 0.08);
});

/** Game won — triumphant jingle. C-E-G-C arpeggio. */
export const playWin = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sine', 523, t, 0.2, 0.2);
  osc(ac, 'sine', 659, t + 0.15, 0.2, 0.2);
  osc(ac, 'sine', 784, t + 0.3, 0.2, 0.2);
  osc(ac, 'sine', 1047, t + 0.45, 0.4, 0.25);
  osc(ac, 'triangle', 523, t + 0.45, 0.4, 0.1);
});

/** Time's up — deflating descend. */
export const playTimeUp = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sine', 440, t, 0.3, 0.15, 330);
  osc(ac, 'sine', 330, t + 0.25, 0.3, 0.12, 220);
  osc(ac, 'triangle', 220, t + 0.5, 0.4, 0.1, 110);
});

/** Number pad button press — tiny click. */
export const playPadPress = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sine', 880, t, 0.03, 0.08);
});

// ---------------------------------------------------------------------------
// New "fun" sounds
// ---------------------------------------------------------------------------

/** Short positive blip — for a correct gate answer or minor milestone.
 *  Cheaper + shorter than playWin so it doesn't overlap gameplay flow. */
export const playCorrect = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'triangle', 660, t, 0.08, 0.18, 990);   // E5 → B5
  osc(ac, 'sine',     990, t + 0.07, 0.12, 0.14); // B5 ring-out
});

/** Soft "no" — low, two-tone, non-punishing. For wrong answers where we
 *  don't want the full splashy playEscape (e.g. modal flash). */
export const playWrong = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'square', 220, t, 0.12, 0.12, 165);     // A3 → E3
  osc(ac, 'square', 165, t + 0.1, 0.14, 0.08, 110); // E3 → A2
});

/** Bubble pop — ambient, playful. Randomized pitch so repeated bubbles
 *  don't sound mechanical. Good for tapping empty cells. */
export const playBubble = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  const base = 500 + Math.random() * 300;
  osc(ac, 'sine', base, t, 0.08, 0.09, base * 1.8);
});

/** Pipe swoosh / fish dart — a short filtered-noise whoosh for things
 *  flying past. Used on Flappy pipe-pass and shark dash. */
export const playSwoop = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  noise(ac, t, 0.18, 0.08, { freq: 1200, q: 2.5 });
  osc(ac, 'sine', 1400, t, 0.15, 0.05, 500);
});

/** Tier-up celebration — louder, longer than playWin; meant to announce
 *  a mastery jump. Major-triad arpeggio with an octave shimmer. */
export const playLevelUp = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  // C major arpeggio then octave up for sparkle
  osc(ac, 'sine', 523, t,        0.14, 0.22); // C5
  osc(ac, 'sine', 659, t + 0.11, 0.14, 0.22); // E5
  osc(ac, 'sine', 784, t + 0.22, 0.14, 0.22); // G5
  osc(ac, 'sine', 1047, t + 0.33, 0.28, 0.28); // C6 held
  // Shimmer: tiny triangle overtone two octaves up
  osc(ac, 'triangle', 2093, t + 0.33, 0.28, 0.06);
  // Bass root for weight
  osc(ac, 'triangle', 131, t,        0.6,  0.1);  // C3
});

/** Game-start chime — quick ascending blip to signal "go!". */
export const playStart = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sine', 440, t,        0.1, 0.14, 660); // A4 → E5
  osc(ac, 'sine', 660, t + 0.08, 0.12, 0.14, 990); // E5 → B5
});

/** Springy pogo "boing" — ONE short rising-pitch transient with a soft attack
 *  and a fast exponential decay, plus a tiny bright tick for sparkle.
 *
 *  This fires on every hop (~3×/sec) while the cupcake walks the 3D town. The
 *  earlier version had a ~0.16s rise-THEN-fall tail; at the walking cadence
 *  those tails butted into each other and fused into a continuous warbling
 *  drone. Keeping the whole sound under ~0.1s (well below the ~0.34s step gap),
 *  with a real attack/decay envelope instead of an instant-on gain, makes each
 *  hop read as a distinct, crisp "boing" — no pile-up.
 *
 *  Throttled at the SOURCE: the walking step fires this ~3×/sec, which without
 *  a gate machine-guns into an annoying drone (kids filed repeat tickets, and
 *  it had been "fixed" per-caller more than once and kept regressing). Rate-
 *  limiting HERE — not in each host — means any caller is capped at ~1/sec and
 *  a new caller can't bring the buzz back. */
const BOUNCE_MIN_GAP_MS = 900;
let lastBounceAt = -Infinity;
export const playBounce = withToggle(() => {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - lastBounceAt < BOUNCE_MIN_GAP_MS) return; // ~1 boing per second
  lastBounceAt = now;
  const ac = getCtx();
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(540, t + 0.06); // fast rise = the boing
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.006); // soft attack (kills the click)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); // fast decay = stays discrete
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + 0.11);
  // Tiny bright tick at the top of the bounce for a touch of spring sparkle.
  osc(ac, 'triangle', 640, t + 0.005, 0.03, 0.02);
});

// ---------------------------------------------------------------------------
// Frosting Fighter (3D rail shooter) sounds
// ---------------------------------------------------------------------------

/** Laser shot — a short descending zap. Bright and quick so rapid taps don't
 *  pile up into a drone. */
export const playLaser = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'sawtooth', 1200, t, 0.1, 0.1, 300); // pew, pitch falling
  osc(ac, 'square', 600, t, 0.05, 0.05, 200);  // a little body
});

/** Treat blasted — a noise-burst pop with a low thump for weight. */
export const playBoom = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  noise(ac, t, 0.18, 0.16, { freq: 320, q: 0.8 });
  osc(ac, 'sine', 160, t, 0.18, 0.12, 60);
});

/** Clip reloaded — a quick "chunk-click" that resolves upward to read as
 *  "locked and loaded". */
export const playReload = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'square', 220, t, 0.05, 0.1);            // chunk
  osc(ac, 'sine', 660, t + 0.06, 0.1, 0.14, 990);  // ready chirp, rising
});

/** Train whistle — a friendly two-toot for hopping on/off the Sugar Express. */
export const playTrainWhistle = withToggle(() => {
  const ac = getCtx();
  const t = ac.currentTime;
  osc(ac, 'triangle', 392, t, 0.18, 0.16, 440);        // toot
  osc(ac, 'triangle', 523, t + 0.16, 0.22, 0.16, 587); // toot up
  noise(ac, t, 0.12, 0.03, { freq: 800, q: 1 });        // steam hiss
});

// ---------------------------------------------------------------------------
// Background music — a gentle looping chiptune. Fully procedural (no audio
// file), routed through a master gain so it can duck to silence when the
// mute toggle is off while the loop keeps running (so un-muting resumes it).
// Uses a look-ahead scheduler: a setInterval wakes ~7×/sec and queues any
// notes due in the next 0.5s, which keeps timing rock-steady regardless of
// timer jitter. Call startMusic() when a game begins, stopMusic() on teardown.
// ---------------------------------------------------------------------------

let musicTimer: number | null = null;
let musicMaster: GainNode | null = null;
let musicStep = 0;
let musicNextTime = 0;

const MUSIC_TEMPO = 0.32; // seconds per step (16 steps ≈ a 5s loop)
// C major pentatonic melody — bouncy and kid-friendly. 0 = rest.
const MUSIC_MELODY = [
  523.25, 0, 659.25, 0, 783.99, 659.25, 587.33, 0,
  523.25, 587.33, 659.25, 0, 880.0, 0, 783.99, 0,
];
// Sparse root/fifth bass underneath.
const MUSIC_BASS = [
  130.81, 0, 0, 0, 196.0, 0, 0, 0,
  174.61, 0, 0, 0, 196.0, 0, 0, 0,
];

function musicNote(
  ac: AudioContext,
  dest: GainNode,
  type: OscillatorType,
  freq: number,
  t: number,
  dur: number,
  gain: number,
): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function musicSchedule(): void {
  if (musicTimer === null || !musicMaster) return;
  const ac = getCtx();
  // Duck to near-silence when muted; keep looping so un-mute resumes instantly.
  musicMaster.gain.setTargetAtTime(isSoundEnabled() ? 0.09 : 0.0001, ac.currentTime, 0.25);
  while (musicNextTime < ac.currentTime + 0.5) {
    const i = musicStep % MUSIC_MELODY.length;
    if (MUSIC_MELODY[i] > 0) {
      musicNote(ac, musicMaster, 'triangle', MUSIC_MELODY[i], musicNextTime, MUSIC_TEMPO * 0.9, 0.5);
    }
    if (MUSIC_BASS[i] > 0) {
      musicNote(ac, musicMaster, 'sine', MUSIC_BASS[i], musicNextTime, MUSIC_TEMPO * 1.7, 0.55);
    }
    musicStep += 1;
    musicNextTime += MUSIC_TEMPO;
  }
}

/** Start the looping background music. No-op if already running. Safe to call
 *  even while muted (it will be silent until un-muted). */
export function startMusic(): void {
  if (musicTimer !== null) return;
  const ac = getCtx();
  musicMaster = ac.createGain();
  musicMaster.gain.value = 0.0001;
  musicMaster.connect(ac.destination);
  musicStep = 0;
  musicNextTime = ac.currentTime + 0.15;
  musicSchedule();
  musicTimer = window.setInterval(musicSchedule, 140);
}

/** Stop the background music and release its nodes. */
export function stopMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicMaster) {
    const g = musicMaster;
    musicMaster = null;
    try {
      g.gain.setTargetAtTime(0, getCtx().currentTime, 0.1);
    } catch {
      // context already gone — nothing to fade
    }
    window.setTimeout(() => {
      try {
        g.disconnect();
      } catch {
        // already disconnected
      }
    }, 500);
  }
}
