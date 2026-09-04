// Cakey, out loud — and in sync with the words on screen.
//
// Clips are rendered at build time by scripts/render-cakey-voice.mjs and served
// from /voice/cakey/<hash>.mp3. That same script captures WHEN each word is
// spoken, so the bubble can highlight along with him.
//
// Why highlight rather than just show text: his lines were already on screen
// before this. Static text beside speech is a caption; text that lights up word
// by word as it is read aloud is a reading support — which matters here, because
// one of the two kids using this is below grade level on sight words.
//
// Gated on the app-wide mute (isSoundEnabled) rather than a control of its own:
// a kid who turned the sound off meant all of it, including him.

import MANIFEST from './cakey-voice-manifest.json';
import { isSoundEnabled } from '@/lib/games/shared/sounds';
import { hashLine } from './hash-line';

interface Timing {
  /** Words exactly as the renderer split them. */
  w: string[];
  /** [startSeconds, endSeconds] per word, same order. */
  t: [number, number][];
}

interface Manifest {
  clips: string[];
  timings: Record<string, Timing>;
}

const DATA = MANIFEST as unknown as Manifest;
const CLIPS = new Set<string>(DATA.clips ?? []);

/** Re-exported so existing importers of this module keep working. The
 *  implementation moved to hash-line.ts so the renderer imports the SAME
 *  function rather than a copy it was asked to keep in step by hand. */
export { hashLine };

/** Words + timings for a line, or null if it was never rendered. */
export function getTiming(text: string): Timing | null {
  return DATA.timings?.[hashLine((text ?? '').trim())] ?? null;
}

export function hasClip(text: string): boolean {
  return CLIPS.has(hashLine((text ?? '').trim()));
}

// ---- Live-speech store ------------------------------------------------------
// A small observable so the bubble can follow along without click handlers
// having to thread an audio element through the component tree. speak() stays
// imperative (it is called from taps); the subtitle just watches.

export interface SpeechState {
  /** The line being spoken, or null when silent. */
  text: string | null;
  /** Index of the word being spoken, or -1 when not word-tracked. */
  wordIndex: number;
  /** Words as the RENDERER split them. The subtitle renders these rather than
   *  re-splitting the string, so the highlight cannot drift off by one because
   *  of a curly apostrophe or an em dash. */
  words: string[];
}

let state: SpeechState = { text: null, wordIndex: -1, words: [] };
const listeners = new Set<(s: SpeechState) => void>();

function emit(next: SpeechState): void {
  state = next;
  for (const fn of listeners) fn(state);
}

export function getSpeechState(): SpeechState {
  return state;
}

export function subscribeSpeech(fn: (s: SpeechState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let current: HTMLAudioElement | null = null;
let raf = 0;

export function stopSpeaking(): void {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (current) {
    current.pause();
    current.currentTime = 0;
    current = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (state.text !== null) emit({ text: null, wordIndex: -1, words: [] });
}

/** Browser speech, for any line without a rendered clip. Slowed and pitched
 *  down a little because the default cadence is chirpy and Cakey is not. */
function fallbackSpeak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 0.9;
  window.speechSynthesis.speak(u);
}

/**
 * Say a line as Cakey, publishing word-level progress as it plays.
 *
 * Safe from a render path: no-ops on the server, when muted, or on empty text.
 * Returns true when real recorded audio is used.
 */
export function speak(text: string): boolean {
  if (typeof window === 'undefined') return false;
  const line = (text ?? '').trim();
  if (!line || !isSoundEnabled()) return false;

  stopSpeaking();

  const hash = hashLine(line);
  const timing = DATA.timings?.[hash] ?? null;

  if (!CLIPS.has(hash)) {
    // No clip: still announce the line so the bubble shows it plainly, just
    // without highlighting (wordIndex stays -1).
    emit({ text: line, wordIndex: -1, words: [] });
    fallbackSpeak(line);
    return false;
  }

  const audio = new Audio(`/voice/cakey/${hash}.mp3`);
  current = audio;
  emit({ text: line, wordIndex: timing ? 0 : -1, words: timing?.w ?? [] });

  const tick = (): void => {
    if (current !== audio || !timing) return;
    const t = audio.currentTime;
    // Last word whose start has passed. A linear scan is fine — lines are short,
    // and it avoids a cursor that can drift out of step after a seek or a stall.
    let idx = -1;
    for (let i = 0; i < timing.t.length; i += 1) {
      if (t >= timing.t[i][0]) idx = i;
      else break;
    }
    if (idx !== state.wordIndex) emit({ ...state, wordIndex: idx });
    raf = requestAnimationFrame(tick);
  };

  audio.addEventListener('error', () => {
    if (current === audio) current = null;
    emit({ text: line, wordIndex: -1, words: [] });
    fallbackSpeak(line);
  });
  audio.addEventListener('ended', () => {
    if (current === audio) {
      current = null;
      // Leave the text up but stop highlighting — the bubble outlives the audio.
      emit({ ...state, wordIndex: -1 });
    }
  });

  void audio
    .play()
    .then(() => {
      if (timing) raf = requestAnimationFrame(tick);
    })
    .catch(() => {
      // Autoplay policy: iOS refuses audio without a user gesture. Cakey only
      // speaks in response to a tap so this is rare; stay quiet rather than
      // surprising anyone with the robot voice.
      if (current === audio) current = null;
      emit({ text: line, wordIndex: -1, words: [] });
    });
  return true;
}

/**
 * Say something WITHOUT putting it on screen.
 *
 * `speak()` publishes the line to the subtitle store so the bubble can show it
 * and highlight along — the right behaviour when Cakey is talking to the kid.
 * It is exactly the wrong behaviour for a spelling question, where the whole
 * question is "what did you hear": printing the word next to four spellings of
 * it turns a listening task into a matching task.
 *
 * Same clip lookup and same browser-voice fallback, no subtitle. Returns true
 * when a recorded Cakey clip was used rather than the fallback voice.
 */
export function speakSilently(text: string): boolean {
  if (typeof window === 'undefined') return false;
  const line = (text ?? '').trim();
  if (!line || !isSoundEnabled()) return false;

  stopSpeaking();

  const hash = hashLine(line);
  if (!CLIPS.has(hash)) {
    fallbackSpeak(line);
    return false;
  }

  const audio = new Audio(`/voice/cakey/${hash}.mp3`);
  current = audio;
  audio.addEventListener('error', () => {
    if (current === audio) current = null;
    fallbackSpeak(line);
  });
  audio.addEventListener('ended', () => {
    if (current === audio) current = null;
  });
  void audio.play().catch(() => {
    // Autoplay policy — the replay button is a tap, so this only bites on the
    // auto-speak when a question opens. Staying quiet is better than the robot
    // voice firing unexpectedly; the kid can tap the speaker.
    if (current === audio) current = null;
  });
  return true;
}
