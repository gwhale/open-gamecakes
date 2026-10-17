'use client';

// CupcakeSpinner — a spinning 3D cupcake character for the Cakey Store.
//
// Every spinner on the page shares ONE offscreen WebGL renderer
// (src/lib/cupcake/stage3d.ts) and ONE requestAnimationFrame loop (below);
// each spinner is just a 2D canvas the stage copies pixels into. That keeps
// the page at a single WebGL context however many shop tiles are showing.
//
//   variant 'hero' — the big preview. Spins on its own, does a hop-and-wiggle
//                    when the config changes, and can be dragged (or turned
//                    with the arrow keys).
//   variant 'tile' — a shop tile. Sways side to side, wider and faster while
//                    `active` (hovered / focused / being tried on), and
//                    redraws at a throttled rate so a full grid stays cheap
//                    on an iPad.
//
// Until three has loaded — and for good if WebGL is unavailable or the
// context is lost — the 2D CupcakeAvatar renders instead. With
// prefers-reduced-motion nothing turns or bounces on its own; the model is
// drawn once per change and still follows a drag.

import { useEffect, useRef, useState } from 'react';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import type { CupcakePose, CupcakeStage } from '@/lib/cupcake/stage3d';

export interface CupcakeSpinnerProps {
  config: CupcakeConfig;
  /** CSS pixel box. */
  width: number;
  height: number;
  variant: 'hero' | 'tile';
  /** Tiles: spin faster and redraw every frame while true. */
  active?: boolean;
  ariaLabel?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared stage + ticker (module singletons, client only)
// ---------------------------------------------------------------------------

interface View {
  canvas: HTMLCanvasElement;
  variant: 'hero' | 'tile';
  config: CupcakeConfig;
  active: boolean;
  visible: boolean;
  dirty: boolean;
  yaw: number;
  /** Tile sway phase. */
  phase: number;
  /** Fling velocity after a drag, rad/ms. */
  vel: number;
  dragging: boolean;
  /** Last drag/key time; auto-spin waits a moment after it. */
  lastInteract: number;
  /** When the current bounce started; 0 = not bouncing. */
  bounceAt: number;
  lastDraw: number;
}

const HERO_SPIN = 0.0009; // rad/ms, about one turn every 7 s
// Tiles sway back and forth around the front rather than turning all the way,
// so a face or glasses on a small tile is visible most of the time.
const TILE_SWAY_SPEED = 0.0012; // rad/ms of sway phase
const TILE_SWAY_SPEED_ACTIVE = 0.0026;
const TILE_SWAY = 0.8; // radians either side of front
const TILE_SWAY_ACTIVE = 1.5;
const TILE_FRAME_MS = 80; // idle tiles redraw at ~12 fps
const BOUNCE_MS = 560;
const RESUME_AFTER_MS = 1500;
const START_YAW = -0.45; // a three-quarter view shows the face and the side

const views = new Set<View>();
const lostListeners = new Set<() => void>();
let stage: CupcakeStage | null = null;
let stagePromise: Promise<CupcakeStage | null> | null = null;
let stageRefs = 0;
let disposeTimer: ReturnType<typeof setTimeout> | null = null;
let raf = 0;
let lastT = 0;
let reducedMq: MediaQueryList | null = null;

function reducedMotion(): boolean {
  if (!reducedMq && typeof window !== 'undefined' && window.matchMedia) {
    reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  return reducedMq?.matches ?? false;
}

function acquireStage(): Promise<CupcakeStage | null> {
  stageRefs++;
  if (disposeTimer) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
  if (!stagePromise) {
    stagePromise = Promise.all([import('three'), import('@/lib/cupcake/stage3d')])
      .then(([THREE, mod]) => {
        const s = mod.createCupcakeStage(THREE);
        s?.onLost(() => {
          stage = null;
          stagePromise = null;
          for (const cb of lostListeners) cb();
        });
        stage = s;
        return s;
      })
      .catch(() => null);
  }
  return stagePromise;
}

function releaseStage(): void {
  stageRefs--;
  if (stageRefs > 0) return;
  // Wait a beat so a quick unmount/remount (a tab switch, StrictMode) reuses
  // the renderer instead of tearing it down and rebuilding it.
  disposeTimer = setTimeout(() => {
    disposeTimer = null;
    if (stageRefs > 0) return;
    stage?.dispose();
    stage = null;
    stagePromise = null;
  }, 1000);
}

function kick(): void {
  if (!raf && typeof window !== 'undefined') raf = requestAnimationFrame(tick);
}

function bouncePose(p: number): Pick<CupcakePose, 'hop' | 'squash' | 'wiggle'> {
  const fade = 1 - p;
  return {
    hop: Math.sin(Math.PI * Math.min(1, p * 1.6)) * 0.16,
    squash: Math.cos(p * Math.PI * 3) * 0.16 * fade,
    wiggle: Math.sin(p * Math.PI * 4) * 0.22 * fade,
  };
}

function tick(t: number): void {
  raf = 0;
  const dt = lastT ? Math.min(64, t - lastT) : 16;
  lastT = t;
  const still = reducedMotion();
  let more = false;

  for (const v of views) {
    if (!v.visible || !stage) continue;
    let animating = false;
    let pose: CupcakePose = { yaw: v.yaw, hop: 0, squash: 0, wiggle: 0 };

    if (v.variant === 'hero') {
      if (v.dragging) {
        animating = true;
      } else if (v.vel !== 0) {
        v.yaw += v.vel * dt;
        v.vel *= Math.pow(0.9, dt / 16);
        if (Math.abs(v.vel) < 0.0002) v.vel = 0;
        animating = true;
      } else if (!still) {
        if (t - v.lastInteract > RESUME_AFTER_MS) v.yaw += HERO_SPIN * dt;
        animating = true;
      }
      if (v.bounceAt && !still) {
        const p = (t - v.bounceAt) / BOUNCE_MS;
        if (p < 1) {
          pose = { ...pose, ...bouncePose(p) };
          animating = true;
        } else {
          v.bounceAt = 0;
          v.dirty = true; // one last frame at rest
        }
      }
      pose.yaw = v.yaw;
      if (animating || v.dirty) {
        stage.draw(v.canvas, v.config, pose);
        v.dirty = false;
        v.lastDraw = t;
      }
    } else {
      if (!still) {
        v.phase += (v.active ? TILE_SWAY_SPEED_ACTIVE : TILE_SWAY_SPEED) * dt;
        v.yaw = START_YAW * 0.5 + Math.sin(v.phase) * (v.active ? TILE_SWAY_ACTIVE : TILE_SWAY);
        animating = true;
      }
      pose.yaw = v.yaw;
      const due = v.active || t - v.lastDraw >= TILE_FRAME_MS;
      if (v.dirty || (animating && due)) {
        stage.draw(v.canvas, v.config, pose);
        v.dirty = false;
        v.lastDraw = t;
      }
    }
    if (animating || v.dirty) more = true;
  }

  if (more) raf = requestAnimationFrame(tick);
  else lastT = 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CupcakeSpinner({
  config,
  width,
  height,
  variant,
  active = false,
  ariaLabel,
  className,
}: CupcakeSpinnerProps): React.ReactElement {
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View | null>(null);
  // Latest props, for the effect that creates the view.
  const latest = useRef({ config, active });
  const prevKey = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { config, active };
  });

  // Load three + the shared stage. Stays 2D if it can't.
  useEffect(() => {
    let cancelled = false;
    acquireStage().then((s) => {
      if (!cancelled && s) setReady(true);
    });
    const onLost = (): void => setReady(false);
    lostListeners.add(onLost);
    return () => {
      cancelled = true;
      lostListeners.delete(onLost);
      releaseStage();
    };
  }, []);

  // Register this canvas with the shared ticker once the stage is up.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const view: View = {
      canvas,
      variant,
      config: latest.current.config,
      active: latest.current.active,
      visible: true,
      dirty: true,
      yaw: START_YAW,
      // Stagger tiles so a grid doesn't sway in step.
      phase: views.size * 0.9,
      vel: 0,
      dragging: false,
      lastInteract: 0,
      bounceAt: 0,
      lastDraw: 0,
    };
    viewRef.current = view;
    views.add(view);
    // Only draw while on screen.
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          view.visible = e.isIntersecting;
          if (view.visible) view.dirty = true;
        }
        kick();
      });
      io.observe(canvas);
    }
    kick();
    return () => {
      io?.disconnect();
      views.delete(view);
      viewRef.current = null;
    };
  }, [ready, variant, width, height]);

  // Push config changes to the view; the hero bounces when it changes.
  const key = JSON.stringify(config);
  useEffect(() => {
    const view = viewRef.current;
    const changed = prevKey.current !== null && prevKey.current !== key;
    prevKey.current = key;
    if (!view) return;
    view.config = latest.current.config;
    view.dirty = true;
    if (changed && variant === 'hero') view.bounceAt = performance.now();
    kick();
  }, [key, variant, ready]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.active = active;
    view.dirty = true;
    kick();
  }, [active, ready]);

  // ---- Drag / keys (hero only) --------------------------------------------
  const lastX = useRef(0);
  const lastMoveT = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const view = viewRef.current;
    if (!view) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    view.dragging = true;
    view.vel = 0;
    lastX.current = e.clientX;
    lastMoveT.current = performance.now();
    kick();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const view = viewRef.current;
    if (!view?.dragging) return;
    const now = performance.now();
    const d = (e.clientX - lastX.current) * 0.014;
    view.yaw += d;
    view.vel = d / Math.max(8, now - lastMoveT.current);
    lastX.current = e.clientX;
    lastMoveT.current = now;
    view.lastInteract = now;
    kick();
  };
  const onPointerUp = (): void => {
    const view = viewRef.current;
    if (!view) return;
    view.dragging = false;
    // A drag that stopped before letting go shouldn't fling.
    if (performance.now() - lastMoveT.current > 80) view.vel = 0;
    view.lastInteract = performance.now();
    kick();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>): void => {
    const view = viewRef.current;
    if (!view || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    view.yaw += e.key === 'ArrowLeft' ? -0.4 : 0.4;
    view.lastInteract = performance.now();
    view.dirty = true;
    kick();
  };

  const hero = variant === 'hero';
  return (
    <span
      className={className}
      style={{ position: 'relative', display: 'inline-block', width, height, lineHeight: 0 }}
    >
      {ready ? (
        <canvas
          ref={canvasRef}
          role={ariaLabel ? 'img' : undefined}
          aria-label={ariaLabel}
          aria-hidden={ariaLabel ? undefined : true}
          tabIndex={hero ? 0 : undefined}
          onPointerDown={hero ? onPointerDown : undefined}
          onPointerMove={hero ? onPointerMove : undefined}
          onPointerUp={hero ? onPointerUp : undefined}
          onPointerCancel={hero ? onPointerUp : undefined}
          onKeyDown={hero ? onKeyDown : undefined}
          style={{
            width,
            height,
            display: 'block',
            // Horizontal drags turn the cupcake; vertical swipes still scroll.
            touchAction: hero ? 'pan-y' : undefined,
            cursor: hero ? 'grab' : undefined,
          }}
        />
      ) : (
        <span
          aria-hidden={ariaLabel ? undefined : true}
          style={{ display: 'flex', width, height, alignItems: 'center', justifyContent: 'center' }}
        >
          <CupcakeAvatar config={config} size={Math.round((height / 1.25) * 0.9)} ariaLabel={ariaLabel} />
        </span>
      )}
    </span>
  );
}
