// Haptic feedback helpers for the kid-facing UI.
//
// iPad Safari supports `navigator.vibrate()` since iOS 17; older iOS
// silently no-ops. We intentionally don't gate on a feature check
// because the no-op cost is zero and a feature check would just
// double the bytes shipped to the kid.
//
// Three durations, named for what they're for — not for their length.
// Calling code should NEVER pass raw milliseconds; they should use
// these named helpers so a future tuning pass can adjust everywhere
// at once.
//
// Usage:
//   import { hapticTap, hapticThump, hapticSuccess } from '@/lib/haptics';
//   <button onClick={() => { hapticTap(); ... }} />

/** Tiny click — for ordinary button taps. ~8ms is barely felt but
 *  registers as "this responded." */
export function hapticTap(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(8);
  }
}

/** Solid bump — for higher-stakes confirmations like selecting a kid
 *  avatar, launching a balloon, or solving a gate. ~22ms feels like
 *  the click of a button you've fully committed to. */
export function hapticThump(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(22);
  }
}

/** Celebratory pulse — for win states, level-ups, scoring milestones.
 *  Three short bumps in quick succession reads as "yay" without
 *  becoming the iOS error-shake (which is two heavier bumps). */
export function hapticSuccess(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([14, 60, 14, 60, 14]);
  }
}

/** Soft "no" — for wrong answers / failed input. Single longer pulse
 *  feels like a subtle correction, not a punishment. */
export function hapticWrong(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(40);
  }
}
