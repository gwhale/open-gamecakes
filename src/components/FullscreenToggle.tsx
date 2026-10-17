'use client';

// Fullscreen toggle — a small button that asks the browser to enter or
// exit true fullscreen mode via the standard Fullscreen API.
//
// Works on:
//   - Desktop Chrome/Firefox/Safari: standard Fullscreen API
//   - iPadOS 16+: standard Fullscreen API (finally — earlier iPadOS
//     only allowed fullscreen on <video> elements)
//   - Older Safari: webkit-prefixed variant, handled below
//   - iPhone / older iPads: Fullscreen API is a no-op and the button
//     reports "not supported" gracefully
//
// Alternative for a "feels-like-an-app" experience: the root layout
// already sets `apple-mobile-web-app-capable` meta tags, so if a parent
// adds the site to the iPad home screen via Safari's share menu, it
// launches as a standalone PWA with no browser chrome — which is
// arguably the BEST fullscreen experience on iPad. This button is the
// mid-game fallback when you're inside Safari and want more vertical
// pixels without exiting and re-entering.

import { useCallback, useEffect, useState } from 'react';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElt = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getIsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FullscreenDoc;
  return Boolean(document.fullscreenElement ?? d.webkitFullscreenElement);
}

async function requestFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  const el = document.documentElement as FullscreenElt;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
  } else if (el.webkitRequestFullscreen) {
    await el.webkitRequestFullscreen();
  }
}

async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  const d = document as FullscreenDoc;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
  } else if (d.webkitExitFullscreen) {
    await d.webkitExitFullscreen();
  }
}

export default function FullscreenToggle({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [isFs, setIsFs] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(true);

  // Initialize + listen for external changes (e.g., user pressing ESC to exit)
  useEffect(() => {
    const el = document.documentElement as FullscreenElt;
    const canRequest = Boolean(el.requestFullscreen ?? el.webkitRequestFullscreen);
    setSupported(canRequest);
    if (!canRequest) return;

    const sync = () => setIsFs(getIsFullscreen());
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const handleClick = useCallback(async () => {
    try {
      if (getIsFullscreen()) {
        await exitFullscreen();
      } else {
        await requestFullscreen();
      }
    } catch (err) {
      // Safari sometimes rejects the promise if the gesture was consumed
      // by the time we call requestFullscreen. Swallow — the user can
      // tap again.
      console.warn('[fullscreen] toggle failed:', err);
    }
  }, []);

  if (!supported) return null;

  return (
    <ChromeNavButton
      onClick={handleClick}
      aria-label={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
      variant="dark"
      size={size === 'sm' ? 'sm' : 'md'}
      className={className}
    >
      {isFs ? '↙ Exit fullscreen' : '⛶ Fullscreen'}
    </ChromeNavButton>
  );
}
