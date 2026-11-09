// PWA manifest for Gamecakes.
//
// When a kid taps Share → Add to Home Screen on iPad, iOS reads this
// manifest to set up the home-screen icon, splash screen, name, and
// launch behavior. With `display: standalone`, opening the icon
// launches Gamecakes full-screen with no Safari chrome — the URL bar,
// tab strip, and bottom navigation bar all disappear, which is the
// single biggest perceptual shift from "web app" to "real app."
//
// Background + theme colors lock the chrome that DOES remain (status
// bar tint, splash screen background) to the cake brand palette so
// the framing matches the content.

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gamecakes',
    short_name: 'Gamecakes',
    description: 'Adaptive math + reading games for kids.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    // Background color shows on the splash screen iOS auto-generates from
    // the icon. Strawberry-tinted vanilla matches the cake brand.
    background_color: '#fef3c7',
    theme_color: '#fb7185',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    categories: ['education', 'kids', 'games'],
  };
}
