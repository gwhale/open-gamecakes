import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAD_JOKES } from './cakey-lines';
import { getSpeechState, hasClip, speak, stopSpeaking } from './cakey-voice';

vi.mock('@/lib/games/shared/sounds', () => ({ isSoundEnabled: () => true }));

class FakeAudio {
  static last: FakeAudio;
  currentTime = 0;
  private handlers = new Map<string, () => void>();
  constructor() {
    FakeAudio.last = this;
  }
  addEventListener(type: string, fn: () => void): void {
    this.handlers.set(type, fn);
  }
  fire(type: string): void {
    this.handlers.get(type)?.();
  }
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
}

describe('speak', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    stopSpeaking();
    vi.unstubAllGlobals();
  });

  it('stops word tracking when a clip ends, so the line stays whole', () => {
    const line = DAD_JOKES.map((j) => j.punchline).find((p) => hasClip(p));
    expect(line).toBeDefined();

    speak(line!);
    expect(getSpeechState().words.length).toBeGreaterThan(0);

    FakeAudio.last.fire('ended');
    expect(getSpeechState()).toEqual({ text: line!.trim(), wordIndex: -1, words: [] });
  });
});
