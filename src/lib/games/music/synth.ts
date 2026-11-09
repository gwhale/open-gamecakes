// Musical Planets — a small piano voice and ONE playback lane.
//
// The PRD's "prevent overlapping playback from becoming confusing" is the
// design: there is only ever one take playing. Starting anything (a chord, a
// scale, a single key tap) fades the previous take out in 40 ms first, so a
// kid mashing "Hear the scale" hears one scale, and tapping a key mid-scale
// stops the scale rather than playing over it.
//
// Every note also fires a callback when it SOUNDS (not when it is scheduled),
// which the host uses to light the piano key and caption the note. Those fire
// even when sound is muted, so the visual equivalent never depends on audio.

import { isSoundEnabled, sharedAudioContext } from '@/lib/games/shared/sounds';
import { frequencyOf, midiOf, pitchName, type Pitch } from './theory';

export interface PlayEvent {
  midis: number[];
  /** Seconds from the start of the take. */
  at: number;
  /** Seconds the note is held. */
  dur: number;
  /** What the caption says while it sounds, e.g. "F♯4" or "G B D". */
  label: string;
}

export interface TakeCallbacks {
  onEvent?: (ev: PlayEvent, index: number) => void;
  onEnd?: () => void;
}

/** Seconds per beat. Slow: an eight-year-old has to be able to follow the
 *  lit keys with their eyes. */
export const BEAT = 0.42;

export function sequence(notes: readonly { pitch: Pitch; beats?: number }[], beat = BEAT): PlayEvent[] {
  let t = 0;
  return notes.map((n) => {
    const dur = (n.beats ?? 1) * beat;
    const ev = { midis: [midiOf(n.pitch)], at: t, dur, label: pitchName(n.pitch) };
    t += dur;
    return ev;
  });
}

export function chord(pitches: readonly Pitch[], dur = 1.4): PlayEvent[] {
  return [{ midis: pitches.map(midiOf), at: 0, dur, label: pitches.map(pitchName).join(' ') }];
}

export function takeLength(events: readonly PlayEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.at + e.dur), 0);
}

interface Take {
  gain: GainNode | null;
  timers: number[];
}

export class MusicPlayer {
  private master: GainNode | null = null;
  private take: Take | null = null;
  private volume = 0.8;

  /** Call from the Start tap: browsers only let audio begin after a gesture. */
  unlock(): void {
    this.ensure();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.55;
  }

  /** Play a take, replacing whatever was playing. */
  play(events: readonly PlayEvent[], cb: TakeCallbacks = {}): void {
    this.stop();
    const ac = this.ensure();
    const audible = ac !== null && isSoundEnabled() && this.volume > 0;
    const take: Take = { gain: null, timers: [] };
    this.take = take;

    const t0 = (ac?.currentTime ?? 0) + 0.04;
    if (audible && ac && this.master) {
      take.gain = ac.createGain();
      take.gain.connect(this.master);
      for (const ev of events) for (const m of ev.midis) this.voice(ac, take.gain, m, t0 + ev.at, ev.dur, ev.midis.length);
    }

    events.forEach((ev, i) => {
      take.timers.push(window.setTimeout(() => cb.onEvent?.(ev, i), (0.04 + ev.at) * 1000));
    });
    take.timers.push(window.setTimeout(() => {
      if (this.take === take) this.take = null;
      cb.onEnd?.();
    }, (0.04 + takeLength(events)) * 1000 + 60));
  }

  /** One key, now. */
  note(pitch: Pitch, cb: TakeCallbacks = {}): void {
    this.play(sequence([{ pitch, beats: 1.6 }]), cb);
  }

  stop(): void {
    const take = this.take;
    if (!take) return;
    this.take = null;
    for (const t of take.timers) window.clearTimeout(t);
    const g = take.gain;
    if (g && this.master) {
      const now = g.context.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 0.04);
      window.setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, 120);
    }
  }

  dispose(): void {
    this.stop();
    try { this.master?.disconnect(); } catch { /* already gone */ }
    this.master = null;
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
    const ac = sharedAudioContext();
    if (!this.master) {
      this.master = ac.createGain();
      this.master.gain.value = this.volume * 0.55;
      this.master.connect(ac.destination);
    }
    return ac;
  }

  /** A soft electric-piano-ish note: triangle body, a quiet octave partial,
   *  fast attack, exponential decay, gentle low-pass. Chord notes are scaled
   *  down so a triad is not three times as loud as a single key. */
  private voice(ac: AudioContext, out: AudioNode, midi: number, start: number, dur: number, voices: number): void {
    const f = frequencyOf(midi);
    const peak = 0.5 / Math.sqrt(voices);
    const end = start + dur + 0.35;

    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    env.gain.exponentialRampToValueAtTime(peak * 0.45, start + Math.min(0.25, dur));
    env.gain.setValueAtTime(peak * 0.45, start + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(4200, f * 6);

    const body = ac.createOscillator();
    body.type = 'triangle';
    body.frequency.value = f;
    const shine = ac.createOscillator();
    shine.type = 'sine';
    shine.frequency.value = f * 2;
    const shineGain = ac.createGain();
    shineGain.gain.value = 0.18;

    body.connect(lp);
    shine.connect(shineGain).connect(lp);
    lp.connect(env).connect(out);
    body.start(start);
    shine.start(start);
    body.stop(end + 0.05);
    shine.stop(end + 0.05);
  }
}
