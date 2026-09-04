// SugarTokenIcon — the Sugar Tokens currency mark.
//
// We used to draw the balance with the 🪙 emoji, but kids kept reading that
// small round gold disc as "the cookie" (the currency's OLD name + old 🍪
// icon), and re-filed it as a bug repeatedly even after the cookies → Sugar
// Tokens rename. Emoji also render differently per device, so we couldn't
// guarantee it read as a coin at all.
//
// This is a crisp, device-independent SVG coin: a gold disc with a darker
// rim and a bright sugar-star stamped in the middle — unmistakably a COIN /
// token, never a cookie. It matches the Cookie Corner hero coin in the 3D
// town so the currency reads the same everywhere.

import type { CSSProperties } from 'react';

export default function SugarTokenIcon({
  size = '1.1em',
  className,
  style,
}: {
  /** Rendered width/height. Defaults to a hair above the text cap height so
   *  it sits nicely inline in a balance pill. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}): React.ReactElement {
  // Decorative by default: every place we render this, the surrounding pill /
  // button already carries an aria-label ("Wallet: N Sugar Tokens"), so the
  // icon is hidden from the accessibility tree to avoid a doubled label.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {/* Coin body — warm gold radial so it reads as shiny metal, not a flat
          biscuit. */}
      <defs>
        <radialGradient id="sugar-token-face" cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="55%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#sugar-token-face)" stroke="#b45309" strokeWidth="1.4" />
      {/* Inner rim ring — the coin edge, the detail a cookie doesn't have. */}
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="#d97706" strokeWidth="1" opacity="0.85" />
      {/* Sugar-star stamp — the "token" motif (matches the 3D hero coin). */}
      <path
        d="M12 5.6l1.65 3.35 3.7.54-2.68 2.61.63 3.68L12 14.0l-3.3 1.73.63-3.68-2.68-2.61 3.7-.54z"
        fill="#fffbeb"
        stroke="#b45309"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
