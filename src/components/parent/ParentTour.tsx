'use client';

// A spotlight tour of /parent for a grown-up who has just arrived.
//
// Starts by itself once for a new family on each device, and any grown-up can
// start it again from the link this component renders. "Seen" is a localStorage
// flag rather than a database column: seeing it twice on two devices costs a
// tap, and the flag needs no migration.
//
// The page marks what to light up with `data-tour` attributes, and steps whose
// target is missing (a button this tier does not get) are dropped.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  cardPosition,
  spotlightBox,
  tourSeenKey,
  tourSteps,
  type Box,
  type TourStep,
} from '@/lib/parent/tour';

const CARD_MAX_WIDTH = 360;
const CARD_SIDE_MARGIN = 32;
/** Lets the page settle first, so the tour does not start on a half-drawn screen. */
const AUTO_START_DELAY_MS = 500;

function findTarget(step: TourStep): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function markSeen(familyId: string): void {
  try {
    localStorage.setItem(tourSeenKey(familyId), '1');
  } catch {
    // Private mode can refuse storage. The tour may show again, which is harmless.
  }
}

function hasSeen(familyId: string): boolean {
  try {
    return localStorage.getItem(tourSeenKey(familyId)) === '1';
  } catch {
    // If we cannot remember dismissing it, do not risk showing it on every visit.
    return true;
  }
}

export default function ParentTour({
  familyId,
  hasPlayers,
  autoStart,
}: {
  familyId: string;
  hasPlayers: boolean;
  autoStart: boolean;
}): React.ReactElement {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const step = steps?.[index] ?? null;

  const start = useCallback(() => {
    const present = tourSteps(hasPlayers).filter((s) => findTarget(s) !== null);
    if (present.length === 0) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    markSeen(familyId);
    setIndex(0);
    setSteps(present);
  }, [familyId, hasPlayers]);

  const close = useCallback(() => {
    setSteps(null);
    setSpot(null);
    setCardPos(null);
    returnFocusRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!autoStart || hasSeen(familyId)) return;
    const t = window.setTimeout(start, AUTO_START_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [autoStart, familyId, start]);

  // Bring the target into view when the step changes.
  useEffect(() => {
    if (!step) return;
    findTarget(step)?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [step]);

  // Keep the spotlight and card on the target through scrolling, rotation, and
  // the smooth scroll above. Measured every frame while open because iPad Safari
  // does not fire a reliable scroll event for every position during a smooth scroll.
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    const measure = () => {
      const el = findTarget(step);
      const card = cardRef.current;
      if (el && card) {
        const r = el.getBoundingClientRect();
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const nextSpot = spotlightBox({ top: r.top, left: r.left, width: r.width, height: r.height }, viewport);
        const nextCard = cardPosition(nextSpot, { width: card.offsetWidth, height: card.offsetHeight }, viewport);
        setSpot((prev) =>
          prev &&
          prev.top === nextSpot.top &&
          prev.left === nextSpot.left &&
          prev.width === nextSpot.width &&
          prev.height === nextSpot.height
            ? prev
            : nextSpot,
        );
        setCardPos((prev) => (prev && prev.top === nextCard.top && prev.left === nextCard.left ? prev : nextCard));
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // The card is hidden until measured, and a hidden button cannot take focus.
  const cardVisible = cardPos !== null;
  useEffect(() => {
    if (step && cardVisible) primaryRef.current?.focus({ preventScroll: true });
  }, [step, cardVisible]);

  // On the document, not the overlay: a tap on the dimmed area drops focus to
  // the body, and the keyboard still has to work after that.
  const open = step !== null;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep keyboard focus inside the card while the page behind it is dimmed.
      const buttons = cardRef.current?.querySelectorAll<HTMLElement>('button');
      if (!buttons || buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      if (!cardRef.current?.contains(active)) {
        e.preventDefault();
        primaryRef.current?.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const isLast = steps !== null && index === steps.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-zinc-400 dark:hover:text-zinc-100"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        Take the tour
      </button>

      {step && steps ? (
        // Catches taps so the dimmed page cannot be used mid-tour. A stray tap
        // does nothing rather than closing it; Skip and Escape are the exits.
        <div className="fixed inset-0 z-[70]">
          {spot ? (
            <div
              aria-hidden
              className="pointer-events-none fixed rounded-2xl motion-safe:transition-all motion-safe:duration-200"
              style={{
                top: spot.top,
                left: spot.left,
                width: spot.width,
                height: spot.height,
                // The white edge is what shows the lit area on a dark page, where
                // the dimming alone is black on near-black.
                boxShadow: '0 0 0 2px #fff, 0 0 0 9999px rgba(0, 0, 0, 0.65)',
              }}
            />
          ) : (
            <div aria-hidden className="fixed inset-0 bg-black/65" />
          )}

          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-tour-title"
            aria-describedby="parent-tour-body"
            className="fixed rounded-2xl bg-white p-5 text-zinc-900 shadow-xl motion-safe:transition-[top,left] motion-safe:duration-200 dark:bg-zinc-900 dark:text-zinc-100"
            style={{
              top: cardPos?.top ?? 16,
              left: cardPos?.left ?? 16,
              width: `min(${CARD_MAX_WIDTH}px, calc(100vw - ${CARD_SIDE_MARGIN}px))`,
              // Hidden until measured, so the card never flashes in the corner.
              visibility: cardPos ? 'visible' : 'hidden',
            }}
          >
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {index + 1} of {steps.length}
            </p>
            <div aria-live="polite">
              <h2 id="parent-tour-title" className="mt-1 text-lg font-semibold">
                {step.title}
              </h2>
              <p id="parent-tour-body" className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {step.body}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-full px-3 text-sm font-medium text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-zinc-400 dark:hover:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={() => setIndex(index - 1)}
                    className="rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    style={{ minHeight: 'var(--min-tap-target)' }}
                  >
                    Back
                  </button>
                ) : null}
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={() => (isLast ? close() : setIndex(index + 1))}
                  className="rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  {isLast ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
