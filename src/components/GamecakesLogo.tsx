// Gamecakes logo — inline SVG component.
//
// Design: a 3-layer cake seen from the side (strawberry / vanilla / mint),
// cherry with a stem on top, subtle plate shadow underneath. Every layer
// has a highlight strip across the top for a tiny bit of dimension, so
// the logo still reads as "frosted cake" at small sizes.
//
// Why SVG (not a PNG): scales perfectly from 16px (favicon) to 256px
// (marketing), costs ~1KB, and stays crisp on retina without needing
// multiple asset sizes. Colors are hard-coded hex (not `currentColor`)
// because the logo has a specific palette that shouldn't change with
// surrounding text color — it's the brand mark, not an icon.
//
// The `showWordmark` variant renders the cake next to the "Gamecakes"
// text for use on the /gate page and similar hero spots. By default
// the component renders just the cake for compact header placement.

import type { CSSProperties } from 'react';

export interface GamecakesLogoProps {
  /** Height of the mark in pixels. Width auto-scales. */
  size?: number;
  className?: string;
  /** Renders the cake + "Gamecakes" wordmark side-by-side. */
  showWordmark?: boolean;
  /** Renders the tagline below the wordmark. Implies showWordmark. */
  showTagline?: boolean;
  /** Paint the wordmark in the strawberry→cherry brand gradient instead of
   *  near-black. For hero spots (login, splash) where the name should pop;
   *  leave off for compact header use where solid reads cleaner. */
  wordmarkGradient?: boolean;
}

export default function GamecakesLogo({
  size = 64,
  className = '',
  showWordmark = false,
  showTagline = false,
  wordmarkGradient = false,
}: GamecakesLogoProps) {
  const withText = showWordmark || showTagline;

  if (!withText) {
    return <CakeMark size={size} className={className} />;
  }

  // Size the wordmark relative to the mark for visual harmony.
  const wordmarkSize = Math.round(size * 0.55);
  const taglineSize = Math.round(size * 0.18);

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <CakeMark size={size} />
      <div className="flex flex-col leading-none">
        <div
          className={`font-display font-bold tracking-tight ${
            wordmarkGradient
              ? 'bg-gradient-to-r from-[#fb7185] via-[#f43f5e] to-[#e11d48] bg-clip-text text-transparent'
              : 'text-zinc-900 dark:text-zinc-100'
          }`}
          style={{ fontSize: wordmarkSize, lineHeight: 1 }}
        >
          Gamecakes
        </div>
        {showTagline ? (
          <div
            className="font-display mt-2 italic text-zinc-500 dark:text-zinc-400"
            style={{ fontSize: taglineSize }}
          >
            a learning world
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The cake mark on its own (no text). */
function CakeMark({ size, className = '' }: { size: number; className?: string }) {
  const style: CSSProperties = { height: size, width: 'auto' };
  return (
    <svg
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Gamecakes"
      className={className}
      style={style}
    >
      {/* Plate shadow — gives the cake a place to sit without drawing a full plate */}
      <ellipse cx="64" cy="114" rx="54" ry="4" fill="#71717a" opacity="0.25" />

      {/* Bottom layer — strawberry pink */}
      <g>
        <rect x="14" y="84" width="100" height="28" rx="5" fill="#fb7185" />
        {/* Highlight strip on top edge */}
        <rect x="14" y="84" width="100" height="5" rx="2" fill="#fda4af" />
        {/* Sprinkles on the body */}
        <circle cx="30" cy="100" r="1.5" fill="#fffbeb" />
        <circle cx="46" cy="96"  r="1.5" fill="#fffbeb" />
        <circle cx="58" cy="102" r="1.5" fill="#fffbeb" />
        <circle cx="74" cy="98"  r="1.5" fill="#fffbeb" />
        <circle cx="90" cy="103" r="1.5" fill="#fffbeb" />
        <circle cx="100" cy="97" r="1.5" fill="#fffbeb" />
      </g>

      {/* Middle layer — buttery vanilla */}
      <g>
        <rect x="24" y="58" width="80" height="26" rx="5" fill="#fde68a" />
        <rect x="24" y="58" width="80" height="5"  rx="2" fill="#fef3c7" />
      </g>

      {/* Top layer — mint */}
      <g>
        <rect x="36" y="34" width="56" height="24" rx="5" fill="#6ee7b7" />
        <rect x="36" y="34" width="56" height="5"  rx="2" fill="#a7f3d0" />
      </g>

      {/* Cherry stem — curved single-stroke path */}
      <path
        d="M 64 24 Q 74 14 80 8"
        stroke="#166534"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Cherry */}
      <circle cx="64" cy="25" r="10" fill="#dc2626" />
      {/* Highlight dot on cherry */}
      <circle cx="60" cy="21" r="3" fill="#fecaca" opacity="0.9" />
    </svg>
  );
}
