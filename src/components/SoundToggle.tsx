'use client';

// Sound-on/off toggle — a small button wired to the shared mute flag in
// `src/lib/games/shared/sounds.ts`. The flag persists in localStorage,
// so the choice follows the device across visits and across games.
//
// Click plays a short "unmute" chime as audible confirmation that audio
// is now on; muting is silent (obviously).

import { useCallback, useEffect, useState } from 'react';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';
import {
  isSoundEnabled,
  setSoundEnabled,
  subscribeSound,
  playBubble,
} from '@/lib/games/shared/sounds';

export default function SoundToggle({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  // Defer the initial read to avoid SSR hydration mismatch — localStorage
  // isn't available during server render.
  const [enabled, setEnabled] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(isSoundEnabled());
    setHydrated(true);
    const unsub = subscribeSound((next) => setEnabled(next));
    return unsub;
  }, []);

  const handleClick = useCallback(() => {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) {
      // Confirm audio is actually on with a quick pop. The AudioContext
      // also needs a user gesture to unsuspend on iOS, so this doubles
      // as the "primer" click that wakes the audio pipeline.
      playBubble();
    }
  }, [enabled]);

  // Render a stable placeholder until hydrated so React doesn't complain
  // about server/client markup diff.
  const label = !hydrated ? '🔊' : enabled ? '🔊' : '🔇';
  const aria = enabled ? 'Turn sound off' : 'Turn sound on';

  // The shared dark chrome pill. This used to be a hand-rolled copy of the
  // treatment (border-white/20, font-medium, no focus ring) which had drifted
  // from ChromeNavLink's; both now read the same constants.
  return (
    <ChromeNavButton
      onClick={handleClick}
      aria-label={aria}
      aria-pressed={enabled}
      title={aria}
      variant="dark"
      size={size === 'sm' ? 'sm' : 'md'}
      className={className}
    >
      {label}
    </ChromeNavButton>
  );
}
