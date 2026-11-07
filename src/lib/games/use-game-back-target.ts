'use client';

// The one way a game host asks "where does my back button go?".
//
// Every host used to write this line for itself:
//
//     const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
//
// Twenty-one times, identically. That is fine right up until the answer needs a
// second input — and it did: the public arcade at /play has to be recognised by
// PATHNAME, because an arcade link gets shared and a game opened straight from
// one still needs an exit that is not the town. Twenty-one copies is twenty-one
// places to forget the new argument, and forgetting it fails silently: the back
// button still renders, still works, and just goes to the wrong place.
//
// So the read lives here now. back-nav.ts keeps the DECISION (pure, testable,
// no React); this supplies it with what the browser knows.

import { usePathname, useSearchParams } from 'next/navigation';
import { resolveGameBackTarget, type BackTarget } from './back-nav';

/** Back target that should OVERRIDE a host's own default, or null to keep it. */
export function useGameBackTarget(): BackTarget | null {
  return resolveGameBackTarget(useSearchParams().get('from'), usePathname());
}
