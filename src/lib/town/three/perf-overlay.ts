// The `?perf=1` readout: what a graphics change costs on the device in hand.
//
// Two different numbers are shown because neither is enough alone. The frame
// interval is what a kid feels, but vsync pins it at 16.7 ms however much spare
// time the frame had, so a change can eat all the headroom without moving it.
// The work time covers tick() including the CPU side of render(), and does move,
// but it cannot see the GPU. p95 is shown beside the average because a hitch is
// what reads as stutter, and an average hides it.

import type * as THREE from 'three';
import type { QualityTier } from './quality';

const WINDOW_FRAMES = 120;
const REDRAW_EVERY_MS = 500;

export interface FrameSummary {
  avgMs: number;
  p95Ms: number;
  fps: number;
}

export function summarizeFrames(intervalsMs: readonly number[]): FrameSummary {
  if (intervalsMs.length === 0) return { avgMs: 0, p95Ms: 0, fps: 0 };
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const avgMs = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { avgMs, p95Ms, fps: avgMs > 0 ? 1000 / avgMs : 0 };
}

export interface TownPerfStats extends FrameSummary {
  tier: QualityTier;
  workMs: number;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
}

export interface PerfOverlay {
  /** Call first thing in the frame. */
  begin(): void;
  /** Call after renderer.render. */
  end(): void;
  latest(): TownPerfStats | null;
  dispose(): void;
}

export function createPerfOverlay(
  container: HTMLElement,
  renderer: THREE.WebGLRenderer,
  tier: QualityTier,
): PerfOverlay {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:absolute;left:8px;bottom:8px;z-index:60;padding:6px 8px;border-radius:6px;' +
    'background:rgba(0,0,0,.72);color:#fff;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;' +
    'white-space:pre;pointer-events:none';
  container.appendChild(el);

  const intervals: number[] = [];
  const works: number[] = [];
  let lastBegin = 0;
  let beginAt = 0;
  let lastRedraw = 0;
  let stats: TownPerfStats | null = null;

  const push = (list: number[], v: number): void => {
    list.push(v);
    if (list.length > WINDOW_FRAMES) list.shift();
  };

  return {
    begin(): void {
      beginAt = performance.now();
      if (lastBegin > 0) push(intervals, beginAt - lastBegin);
      lastBegin = beginAt;
    },
    end(): void {
      const endAt = performance.now();
      push(works, endAt - beginAt);
      if (endAt - lastRedraw < REDRAW_EVERY_MS) return;
      lastRedraw = endAt;
      const { render, memory } = renderer.info;
      stats = {
        ...summarizeFrames(intervals),
        tier,
        workMs: summarizeFrames(works).avgMs,
        calls: render.calls,
        triangles: render.triangles,
        textures: memory.textures,
        geometries: memory.geometries,
      };
      el.textContent =
        `${tier}  ${stats.fps.toFixed(0)} fps\n` +
        `frame ${stats.avgMs.toFixed(1)} ms  p95 ${stats.p95Ms.toFixed(1)}\n` +
        `work  ${stats.workMs.toFixed(1)} ms\n` +
        `calls ${stats.calls}  tris ${(stats.triangles / 1000).toFixed(0)}k\n` +
        `tex ${stats.textures}  geo ${stats.geometries}`;
    },
    latest(): TownPerfStats | null {
      return stats;
    },
    dispose(): void {
      el.remove();
    },
  };
}
