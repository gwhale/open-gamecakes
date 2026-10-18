'use client';

// ModelTurntable — a turning 3D preview of a town model: a build piece in the
// build tray, a ride in the Cakey Garage, a land building in the land panel.
// Same idea as the Cakey Store's CupcakeSpinner, for models that aren't
// cupcakes.
//
// Every turntable on the page shares ONE offscreen WebGL renderer
// (src/lib/town/three/turntable-stage.ts) and ONE requestAnimationFrame loop
// (below); each turntable is just a 2D canvas the stage copies pixels into.
// That keeps the page at a single extra WebGL context however many are showing.
//
//   variant 'hero' — turns on its own and can be dragged (or turned with the
//                    arrow keys); a fling keeps it spinning for a moment.
//   variant 'tile' — turns slowly on its own and redraws at a throttled rate,
//                    so a list of them stays cheap on an iPad.
//
// Until the model has loaded — and for good if WebGL is unavailable, the
// context is lost or the model is missing — `fallback` (the emoji) renders
// instead. With prefers-reduced-motion nothing turns on its own: the model is
// drawn once at a three-quarter angle and still follows a drag.

import { useEffect, useRef, useState } from 'react';
import type { TurntableStage } from '@/lib/town/three/turntable-stage';

export interface ModelTurntableProps {
  /** What to show: `build:<BuildKind>`, `land:<level>` or `vehicle:<VehicleKind>`
   *  (see turntable-stage.ts). One with no model shows the fallback. */
  subject: string;
  /** CSS pixel box. */
  width: number;
  height: number;
  variant: 'hero' | 'tile';
  /** Shown until the model is ready, and instead of it when it can't be. */
  fallback: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared stage + ticker (module singletons, client only)
// ---------------------------------------------------------------------------

interface View {
  canvas: HTMLCanvasElement;
  variant: 'hero' | 'tile';
  subject: string;
  visible: boolean;
  dirty: boolean;
  yaw: number;
  /** Fling velocity after a drag, rad/ms. */
  vel: number;
  dragging: boolean;
  /** Last drag/key time; auto-spin waits a moment after it. */
  lastInteract: number;
  lastDraw: number;
}

const HERO_SPIN = 0.0008; // rad/ms, about one turn every 8 s
const TILE_SPIN = 0.0005;
const HERO_FRAME_MS = 32; // auto-spin at ~30 fps; a drag draws every frame
const TILE_FRAME_MS = 80; // ~12 fps
const RESUME_AFTER_MS = 1500;
const START_YAW = -0.6; // a three-quarter view shows the front and a side

const views = new Set<View>();
const lostListeners = new Set<() => void>();
let stage: TurntableStage | null = null;
let stagePromise: Promise<TurntableStage | null> | null = null;
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

function acquireStage(): Promise<TurntableStage | null> {
  stageRefs++;
  if (disposeTimer) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
  if (!stagePromise) {
    stagePromise = Promise.all([import('three'), import('@/lib/town/three/turntable-stage')])
      .then(([THREE, mod]) => {
        const s = mod.createTurntableStage(THREE);
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
  // Wait a beat so a quick unmount/remount (closing and reopening the tray,
  // StrictMode) reuses the renderer and its loaded models.
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

function tick(t: number): void {
  raf = 0;
  const dt = lastT ? Math.min(64, t - lastT) : 16;
  lastT = t;
  const still = reducedMotion();
  let more = false;

  for (const v of views) {
    if (!v.visible || !stage) continue;
    let animating = false;
    let urgent = false;
    if (v.dragging) {
      animating = urgent = true;
    } else if (v.vel !== 0) {
      v.yaw += v.vel * dt;
      v.vel *= Math.pow(0.9, dt / 16);
      if (Math.abs(v.vel) < 0.0002) v.vel = 0;
      animating = urgent = true;
    } else if (!still) {
      if (t - v.lastInteract > RESUME_AFTER_MS) v.yaw += (v.variant === 'hero' ? HERO_SPIN : TILE_SPIN) * dt;
      animating = true;
    }
    const due = urgent || t - v.lastDraw >= (v.variant === 'hero' ? HERO_FRAME_MS : TILE_FRAME_MS);
    if (v.dirty || (animating && due)) {
      stage.draw(v.canvas, v.subject, v.yaw);
      v.dirty = false;
      v.lastDraw = t;
    }
    if (animating || v.dirty) more = true;
  }

  if (more) raf = requestAnimationFrame(tick);
  else lastT = 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelTurntable({
  subject,
  width,
  height,
  variant,
  fallback,
  ariaLabel,
  className,
}: ModelTurntableProps): React.ReactElement {
  // The subject whose model is loaded and showing; null shows the fallback.
  const [shown, setShown] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View | null>(null);

  // Load three + the shared stage, then this subject's model. Keeps the
  // fallback if either can't load.
  useEffect(() => {
    let cancelled = false;
    acquireStage().then(async (s) => {
      if (!s || cancelled) return;
      const ok = await s.load(subject);
      if (!cancelled) setShown(ok ? subject : null);
    });
    const onLost = (): void => setShown(null);
    lostListeners.add(onLost);
    return () => {
      cancelled = true;
      lostListeners.delete(onLost);
      releaseStage();
    };
  }, [subject]);

  const ready = shown === subject;

  // Register this canvas with the shared ticker once the model is up.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const view: View = {
      canvas,
      variant,
      subject,
      visible: true,
      dirty: true,
      // Stagger tiles so a list doesn't turn in step.
      yaw: START_YAW + (variant === 'tile' && !reducedMotion() ? views.size * 1.3 : 0),
      vel: 0,
      dragging: false,
      lastInteract: 0,
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
  }, [ready, subject, variant, width, height]);

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
      data-turntable={ready ? '3d' : 'fallback'}
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
            // Horizontal drags turn the model; vertical swipes still scroll.
            touchAction: hero ? 'pan-y' : undefined,
            cursor: hero ? 'grab' : undefined,
          }}
        />
      ) : (
        <span
          role={ariaLabel ? 'img' : undefined}
          aria-label={ariaLabel}
          aria-hidden={ariaLabel ? undefined : true}
          style={{ display: 'flex', width, height, alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
        >
          {fallback}
        </span>
      )}
    </span>
  );
}
