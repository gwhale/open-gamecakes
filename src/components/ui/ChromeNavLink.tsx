// Chrome nav — the floating pill used for every "back" / nav / toggle control
// across kid-facing pages. Two exports, one visual identity:
//
//   <ChromeNavLink href="...">   — navigates (renders an <a>)
//   <ChromeNavButton onClick={}> — acts in place (renders a <button>)
//
// The button sibling is the point of this file's last revision. ChromeNavLink
// only ever rendered a Link, so every control that needed an onClick — the
// sound toggle, the fullscreen toggle, the feedback launcher, the map menu,
// the town's icon cluster — hand-rolled the pill instead. Those copies drifted
// into four different definitions (border-white/15 vs /20 vs /30, font-medium
// vs font-bold, with and without font-display, none with a focus ring). Both
// exports below read the SAME constants, so they cannot drift again.
//
// Two variants:
//   'light' — pages with a light or gradient background. Translucent white
//             pill, rose border, rose label.
//   'dark'  — fullscreen overlays and game canvases. Deep zinc pill, white
//             label. The blur is what keeps it legible over a live 3D scene
//             without tuning per surface.
//
// Every variant: font-display, active:scale-95, 44px minimum height, and the
// two-tone focus ring — whose two tones SWAP per variant, because the inner
// band has to contrast with the pill it sits on (see chromeStyle).

import Link from 'next/link';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ChromeNavVariant = 'light' | 'dark';
export type ChromeNavSize = 'sm' | 'md' | 'lg';

// Light variant — translucent white pill on a brand-tinted page bg.
const LIGHT_CLASSES =
  'border-rose-200 bg-white/85 text-rose-700 shadow-sm shadow-rose-200/30 ' +
  'hover:bg-white hover:border-rose-300 ' +
  'dark:border-rose-900/40 dark:bg-zinc-900/70 dark:text-rose-300';

// Dark variant — deep zinc with a subtle rose-accent border, for fullscreen
// overlays + game canvases.
const DARK_CLASSES =
  'border-white/15 bg-zinc-900/85 text-white shadow-md ' +
  'hover:bg-zinc-900 hover:border-rose-300/30';

const SIZE_CLASSES: Record<ChromeNavSize, string> = {
  sm: 'px-3.5 py-2 text-sm rounded-full',
  md: 'px-4 py-2.5 text-sm rounded-full',
  lg: 'px-6 py-3.5 text-base rounded-2xl',
};

/** Everything both exports share. Single source of truth for the pill. */
const BASE_CLASSES = [
  'chrome-focus',
  'font-display font-bold inline-flex items-center justify-center gap-1',
  'border backdrop-blur-sm select-none touch-manipulation',
  'transition-[transform,box-shadow,background-color,border-color] duration-100 ease-out',
  'active:scale-95',
  // Inert styling lives in `.chrome-inert` — not `opacity-50`, which fades the
  // label along with the pill. Same reasoning as the candy shell's inert state
  // (The Readable-Inert Rule in DESIGN.md); applied here so the system doesn't
  // state a rule one component quietly breaks.
  'chrome-inert disabled:active:scale-100',
].join(' ');

function chromeClasses(
  variant: ChromeNavVariant,
  size: ChromeNavSize,
  className: string,
): string {
  return [
    BASE_CLASSES,
    variant === 'dark' ? DARK_CLASSES : LIGHT_CLASSES,
    SIZE_CLASSES[size],
    className,
  ].join(' ');
}

/** The focus ring's inner band has to contrast with the pill it sits on, so the
 *  two tones swap per variant: light inner on the dark pill, dark inner on the
 *  light one. Getting this backwards doesn't break the ring (the outer band
 *  still shows against the page) but it silently wastes 2 of its 5px. */
function chromeStyle(variant: ChromeNavVariant): React.CSSProperties {
  return {
    minHeight: 'var(--min-tap-target)',
    '--ring-inner': variant === 'dark' ? 'var(--focus-light)' : 'var(--focus-dark)',
    '--ring-outer': variant === 'dark' ? 'var(--focus-dark)' : 'var(--focus-light)',
  } as React.CSSProperties;
}

export interface ChromeNavLinkProps {
  href: string;
  children: ReactNode;
  variant?: ChromeNavVariant;
  size?: ChromeNavSize;
  /** Extra inline classes for layout-only concerns (margin, width). Don't
   *  override the visual identity here — that defeats the point of having a
   *  unified component. */
  className?: string;
  /** Accessibility label. Defaults to `children` (usually a short visible
   *  string like "← Town"). Override for icon-only or ambiguous links. */
  ariaLabel?: string;
}

export function ChromeNavLink({
  href,
  children,
  variant = 'light',
  size = 'md',
  className = '',
  ariaLabel,
}: ChromeNavLinkProps): React.ReactElement {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={chromeClasses(variant, size, className)}
      style={chromeStyle(variant)}
    >
      {children}
    </Link>
  );
}

export interface ChromeNavButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  children: ReactNode;
  variant?: ChromeNavVariant;
  size?: ChromeNavSize;
  className?: string;
}

/** The same pill as ChromeNavLink, for controls that act instead of navigate
 *  (sound, fullscreen, feedback, menu toggles, the town's icon cluster).
 *  Icon-only usage MUST pass `aria-label`. */
export function ChromeNavButton({
  children,
  variant = 'dark',
  size = 'md',
  className = '',
  type = 'button',
  style,
  ...rest
}: ChromeNavButtonProps): React.ReactElement {
  return (
    <button
      type={type}
      className={chromeClasses(variant, size, className)}
      style={{ ...chromeStyle(variant), ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
