// Musical Planets — what a kid has done, kept on this device.
//
// The PRD asks for no account, so progress lives in localStorage and never
// touches /api/attempts. Every read and write is guarded: a private window or
// blocked storage gives a fresh start, never a crash.

import { MISSIONS } from './missions';

const KEY = 'gc_musical_planets_v1';

export interface MusicSettings {
  /** 0..1, applied on top of the global sound toggle. */
  volume: number;
  /** Challenge mode: piano note names hidden. */
  hideLabels: boolean;
  /** Forced reduced motion, on top of the OS setting. */
  calm: boolean;
}

export interface MusicProgress {
  completed: string[];
  settings: MusicSettings;
}

export const DEFAULT_PROGRESS: MusicProgress = {
  completed: [],
  settings: { volume: 0.8, hideLabels: false, calm: false },
};

const KNOWN = new Set(MISSIONS.map((m) => m.id));

export function loadProgress(): MusicProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const j = JSON.parse(raw) as Partial<MusicProgress>;
    const s = (j.settings ?? {}) as Partial<MusicSettings>;
    return {
      completed: Array.isArray(j.completed) ? j.completed.filter((id) => KNOWN.has(id)) : [],
      settings: {
        volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULT_PROGRESS.settings.volume,
        hideLabels: s.hideLabels === true,
        calm: s.calm === true,
      },
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveProgress(p: MusicProgress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked or full: the in-memory progress still drives this visit.
  }
}
