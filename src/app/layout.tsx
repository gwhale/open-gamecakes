import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Fredoka } from 'next/font/google';
import './globals.css';
import IpadInstallPrompt from '@/components/IpadInstallPrompt';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Fredoka is a rounded display font that reads ~30% faster for ages
// 4-9 than the tech-startup sans Geist Sans — kids' visual cortex
// latches onto the soft curves + chunky weight. Scoped to headings
// + display surfaces only; body copy stays Geist so the dashboards
// + tickets pages keep their dense-text legibility.
const fredoka = Fredoka({
  variable: '--font-fredoka',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Gamecakes',
  description: 'Adaptive math + reading games for kids.',
  // iOS Safari "Add to Home Screen" hints — when bookmarked to the iPad
  // home screen the app launches as a standalone PWA with no Safari chrome.
  // statusBarStyle: 'black-translucent' means the iOS status bar overlays
  // the app content with white icons, so we get true edge-to-edge.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Gamecakes',
  },
  // Brand-colored theming for the OS status bar (Android Chrome) and
  // splash backdrop (iOS auto-generated splash from icon + bg).
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'format-detection': 'telephone=no',
  },
};

export const viewport: Viewport = {
  // Fixed 1.0 scale prevents pinch-zoom on kid taps. viewportFit:'cover'
  // lets the canvas extend behind the iPad's notch/dynamic island so
  // the app feels truly edge-to-edge in standalone mode.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#fb7185',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      {/* `select-none` + `overscroll-none` site-wide kill the iOS long-
          press text-select menu and the gray rubber-band scroll. Inputs
          inside the page can re-enable selection via `select-text`.
          `touch-none` on body would block pointer events to the canvas;
          we apply `touch-action: manipulation` per-element instead via
          globals.css so clicks register without the 300ms double-tap
          zoom delay. */}
      <body className="min-h-full flex flex-col select-none overscroll-none antialiased">
        {children}
        <IpadInstallPrompt />
      </body>
    </html>
  );
}
