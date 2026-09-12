'use client';

// AnimatedCoinCount — a Sugar-Token number that ROLLS from its previous value to
// the new one (tween.js eased count-up / count-down) with a brief bump, so
// earning or spending coins feels rewarding instead of snapping. Only animates
// on CHANGE (first render shows the value as-is) and snaps instantly under
// prefers-reduced-motion. Drop-in for any wallet number span.

import { useEffect, useRef, useState } from 'react';
import { Tween, Easing, Group } from '@tweenjs/tween.js';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

interface AnimatedCoinCountProps {
  value: number;
  /** Classes for the number span (e.g. font-mono tabular-nums). */
  className?: string;
}

export default function AnimatedCoinCount({
  value,
  className,
}: AnimatedCoinCountProps): React.ReactElement {
  const [display, setDisplay] = useState(value);
  const [bump, setBump] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    if (from === value) return;
    prevRef.current = value;

    // Reduced-motion (or no diff worth animating): snap.
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }

    const state = { n: from };
    const group = new Group();
    const tween = new Tween(state, group)
      .to({ n: value }, 460)
      .easing(Easing.Quadratic.Out)
      .onUpdate(() => setDisplay(Math.round(state.n)))
      .start();

    setBump(true);
    let raf = 0;
    const loop = (t: number): void => {
      group.update(t);
      if (tween.isPlaying()) {
        raf = requestAnimationFrame(loop);
      } else {
        setDisplay(value); // land exactly on the target
      }
    };
    raf = requestAnimationFrame(loop);
    const bumpTimer = window.setTimeout(() => setBump(false), 300);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(bumpTimer);
      group.removeAll();
    };
  }, [value]);

  return (
    <span
      className={
        'inline-block transition-transform duration-200 ' +
        (bump ? 'scale-125' : 'scale-100') +
        (className ? ' ' + className : '')
      }
    >
      {display}
    </span>
  );
}
