// CupcakeAvatar — SVG renderer for kids' cupcake avatars.
//
// Stateless. Pass a CupcakeConfig + size; get back an SVG that draws
// the layered cupcake (paper liner → frosting swirl → topping →
// optional foil collar). Same component used in the kid picker, the
// town greeter, parent dashboards, and the future shop preview.
//
// Why SVG instead of an emoji or canvas:
//   - Sharp at any zoom/DPR, including iPad retina + ultra-wide
//     parent dashboards.
//   - The customization shop preview needs to swap parts live; SVG
//     re-renders on prop change without canvas teardown.
//   - Accessibility — we can label the whole thing with a single
//     aria-label that describes the cupcake config.
//
// The SVG is drawn into a 64×80 viewBox; size is the rendered pixel
// width. Height auto-scales with the same aspect ratio. The variety
// scale is applied via an inner <g transform="scale(s)"> so the
// avatar's footprint stays consistent across mini/classic/tall.

import { type CSSProperties } from 'react';
import {
  type CupcakeConfig,
  WRAPPER_COLORS,
  FROSTING_COLORS,
  VARIETY_TRAITS,
} from '@/lib/cupcake/config';

export interface CupcakeAvatarProps {
  config: CupcakeConfig;
  /** Rendered width in pixels. Height = size * 1.25. Defaults to 64
   *  which fits the kid picker tile + parent dashboard chip nicely. */
  size?: number;
  /** Extra inline styles (e.g. drop-shadow) layered onto the wrapping
   *  span. Do not use for layout — keep the avatar inline-block. */
  style?: CSSProperties;
  /** Override aria-label. Default describes the config in plain
   *  language — "vanilla cupcake with pink frosting and a cherry". */
  ariaLabel?: string;
  /** Optional extra class names for the wrapping span. */
  className?: string;
}

const VIEW_W = 64;
const VIEW_H = 80;

export function CupcakeAvatar({
  config,
  size = 64,
  style,
  ariaLabel,
  className,
}: CupcakeAvatarProps): React.ReactElement {
  const traits = VARIETY_TRAITS[config.variety];
  const wrapper = WRAPPER_COLORS[config.wrapper];
  const frosting = FROSTING_COLORS[config.frosting];
  const label = ariaLabel ?? describeCupcake(config);

  // Pixel height matches viewBox aspect ratio so callers can rely on
  // the avatar fitting where size is the constraint.
  const heightPx = (size * VIEW_H) / VIEW_W;

  return (
    <span
      role="img"
      aria-label={label}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: heightPx,
        lineHeight: 0,
        ...style,
      }}
    >
      <svg
        width={size}
        height={heightPx}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Inner group scales for variety so the treat floats in the
            same canvas regardless of mini/classic/tall. The base picks
            the body silhouette; frosting + topping apply on any base.
            (variety's frostingStacks/collar only matter for cupcakes.) */}
        <g transform={`translate(${VIEW_W / 2} ${VIEW_H / 2}) scale(${traits.scale}) translate(${-VIEW_W / 2} ${-VIEW_H / 2})`}>
          {config.base === 'cupcake' ? (
            <>
              {traits.collar ? <FoilCollar /> : null}
              <PaperWrapper colors={wrapper} />
              <FrostingSwirl colors={frosting} stacks={traits.frostingStacks} />
              <Topping kind={config.topping} />
            </>
          ) : config.base === 'cakepop' ? (
            <>
              <CakePop colors={frosting} />
              {/* Nudge the topping down onto the ball face. */}
              <g transform="translate(0 8)">
                <Topping kind={config.topping} />
              </g>
            </>
          ) : (
            <>
              <LayeredCake wrapper={wrapper} frosting={frosting} />
              {/* Nudge the topping onto the top tier's icing. */}
              <g transform="translate(0 6)">
                <Topping kind={config.topping} />
              </g>
            </>
          )}
        </g>
      </svg>
    </span>
  );
}

/** Plain-English description for screen readers. */
function describeCupcake(c: CupcakeConfig): string {
  const top = c.topping === 'none' ? '' : ` and ${describeTopping(c.topping)}`;
  if (c.base === 'cakepop') {
    return `${c.frosting} cake pop${top}`;
  }
  if (c.base === 'layered') {
    const sponge = c.wrapper === 'plain' ? '' : `${c.wrapper} `;
    return `${sponge}layered cake with ${c.frosting} frosting${top}`;
  }
  const wrapperName = c.wrapper === 'plain' ? 'plain' : c.wrapper;
  const desc = `${wrapperName} cupcake with ${c.frosting} frosting`;
  const variety = c.variety === 'classic' ? '' : `, ${c.variety} size`;
  return desc + top + variety;
}

function describeTopping(t: CupcakeConfig['topping']): string {
  switch (t) {
    case 'cherry': return 'a cherry';
    case 'sprinkles': return 'sprinkles';
    case 'candle': return 'a candle';
    case 'star': return 'a star';
    case 'rainbow': return 'a rainbow';
    case 'none': return '';
  }
}

// ---------------------------------------------------------------------------
// Layer components — kept tiny + local so the renderer reads top-to-
// bottom like the real-world stacking order.
// ---------------------------------------------------------------------------

/** Trapezoid paper liner with three vertical ridges + a band at the
 *  rim. Centered horizontally; baseline at y ≈ 70. */
function PaperWrapper({
  colors,
}: {
  colors: { paper: string; band: string; ridge: string };
}): React.ReactElement {
  return (
    <g>
      {/* Main trapezoid — narrow base, wide top. The top edge meets
          the frosting at y=42. */}
      <path
        d="M 18 70 L 14 42 L 50 42 L 46 70 Z"
        fill={colors.paper}
        stroke={colors.band}
        strokeWidth={1}
      />
      {/* Vertical ridges suggesting the pleated paper liner. */}
      <line x1="22" y1="44" x2="22" y2="68" stroke={colors.ridge} strokeWidth={0.8} />
      <line x1="32" y1="44" x2="32" y2="69" stroke={colors.ridge} strokeWidth={0.8} />
      <line x1="42" y1="44" x2="42" y2="68" stroke={colors.ridge} strokeWidth={0.8} />
      {/* Rim band — slightly darker stripe at the very top. */}
      <rect x="13" y="40" width="38" height="3.2" rx="1" fill={colors.band} />
    </g>
  );
}

/** Single or stacked soft-serve swirl. The swirl is built from three
 *  lobes (bottom big, middle medium, top small) so it reads as a
 *  piped frosting rosette rather than a blob. */
function FrostingSwirl({
  colors,
  stacks,
}: {
  colors: { fill: string; shade: string; highlight: string };
  stacks: 1 | 2;
}): React.ReactElement {
  return (
    <g>
      {/* Base lobe — sits on the wrapper rim. */}
      <ellipse cx="32" cy="38" rx="22" ry="9" fill={colors.fill} stroke={colors.shade} strokeWidth={1} />
      {/* Mid lobe. */}
      <ellipse cx="32" cy="29" rx="17" ry="8" fill={colors.fill} stroke={colors.shade} strokeWidth={1} />
      {/* Highlight on the front of the mid lobe — small ellipse. */}
      <ellipse cx="26" cy="27" rx="5" ry="2.2" fill={colors.highlight} opacity={0.55} />
      {/* Top lobe (default — the "tip" of the swirl). */}
      <ellipse cx="32" cy="22" rx="12" ry="7" fill={colors.fill} stroke={colors.shade} strokeWidth={1} />
      {stacks === 2 ? (
        <>
          <ellipse cx="32" cy="15" rx="9" ry="5.5" fill={colors.fill} stroke={colors.shade} strokeWidth={1} />
          <ellipse cx="32" cy="9.5" rx="6" ry="4" fill={colors.fill} stroke={colors.shade} strokeWidth={1} />
        </>
      ) : null}
    </g>
  );
}

/** Foil-collar accent for the 'fancy' variety — a thin gold band at
 *  the wrapper rim. Sits behind the wrapper so the wrapper edge
 *  remains the dominant silhouette. */
function FoilCollar(): React.ReactElement {
  return (
    <rect
      x="9"
      y="38"
      width="46"
      height="6"
      rx="2.5"
      fill="#fde68a"
      stroke="#b45309"
      strokeWidth={0.8}
    />
  );
}

/** Cake pop — a frosting-coated ball on a paper stick. The frosting
 *  color IS the candy coating (the swirl's fill/shade/highlight reused
 *  as the ball's fill/rim/shine), so every frosting the kid owns works
 *  as a cake-pop flavor. Wrapper is not used on a cake pop. */
function CakePop({
  colors,
}: {
  colors: { fill: string; shade: string; highlight: string };
}): React.ReactElement {
  return (
    <g>
      {/* Stick — drawn first so the ball overlaps its top. */}
      <rect x="30.8" y="40" width="2.4" height="34" rx="1.2" fill="#e7cfa3" stroke="#b08968" strokeWidth={0.6} />
      {/* Coated ball. */}
      <circle cx="32" cy="30" r="17" fill={colors.fill} stroke={colors.shade} strokeWidth={1.3} />
      {/* Shine. */}
      <ellipse cx="25" cy="24" rx="5" ry="3.4" fill={colors.highlight} opacity={0.6} />
    </g>
  );
}

/** Layered cake — three stacked sponge tiers with a frosting band
 *  between each and a domed frosting top. Sponge color comes from the
 *  wrapper (so vanilla/chocolate/strawberry wrappers read as cake
 *  flavors); the frosting color is the icing. Silhouette references the
 *  brand CakeMark in GamecakesLogo. */
function LayeredCake({
  wrapper,
  frosting,
}: {
  wrapper: { paper: string; band: string; ridge: string };
  frosting: { fill: string; shade: string; highlight: string };
}): React.ReactElement {
  return (
    <g>
      {/* Bottom tier. */}
      <rect x="12" y="56" width="40" height="15" rx="3" fill={wrapper.paper} stroke={wrapper.band} strokeWidth={1} />
      <rect x="11" y="52.5" width="42" height="5" rx="2.5" fill={frosting.fill} stroke={frosting.shade} strokeWidth={0.6} />
      {/* Middle tier. */}
      <rect x="17.5" y="42" width="29" height="13" rx="3" fill={wrapper.paper} stroke={wrapper.band} strokeWidth={1} />
      <rect x="16.5" y="38.5" width="31" height="5" rx="2.5" fill={frosting.fill} stroke={frosting.shade} strokeWidth={0.6} />
      {/* Top tier. */}
      <rect x="23" y="29" width="18" height="12" rx="3" fill={wrapper.paper} stroke={wrapper.band} strokeWidth={1} />
      {/* Domed frosting crown. */}
      <ellipse cx="32" cy="29" rx="10.5" ry="5" fill={frosting.fill} stroke={frosting.shade} strokeWidth={0.8} />
      <ellipse cx="28.5" cy="27.5" rx="3.4" ry="1.6" fill={frosting.highlight} opacity={0.6} />
    </g>
  );
}

/** Topping — branches by kind. Positioned at the top of the swirl so
 *  it lands on the tip regardless of single/stacked frosting. The
 *  top-tip is at roughly (32, 18) for stacks=1 and (32, 6) for stacks=2,
 *  but we always anchor the topping to the canonical (32, 18) for
 *  predictable spacing — kids parsing the silhouette want the topping
 *  in the same place every time. */
function Topping({ kind }: { kind: CupcakeConfig['topping'] }): React.ReactElement | null {
  if (kind === 'none') return null;
  if (kind === 'cherry') {
    return (
      <g>
        {/* Stem */}
        <path d="M 32 17 Q 36 11 38 9" stroke="#15803d" strokeWidth={1.4} fill="none" />
        {/* Leaf */}
        <path d="M 38 9 Q 42 7 41 11 Q 39 11 38 9 Z" fill="#22c55e" stroke="#15803d" strokeWidth={0.6} />
        {/* Cherry */}
        <circle cx="32" cy="18" r="4.5" fill="#dc2626" stroke="#7f1d1d" strokeWidth={0.8} />
        <circle cx="30" cy="16.5" r="1.4" fill="#fecaca" opacity={0.85} />
      </g>
    );
  }
  if (kind === 'sprinkles') {
    return (
      <g>
        {/* Six tiny rotated rects scattered across the swirl */}
        <rect x="22" y="20" width="3.2" height="1.4" rx="0.5" fill="#fb7185" transform="rotate(20 22 20)" />
        <rect x="28" y="17" width="3.2" height="1.4" rx="0.5" fill="#fbbf24" transform="rotate(-15 28 17)" />
        <rect x="34" y="20" width="3.2" height="1.4" rx="0.5" fill="#3b82f6" transform="rotate(40 34 20)" />
        <rect x="38" y="24" width="3.2" height="1.4" rx="0.5" fill="#a855f7" transform="rotate(-25 38 24)" />
        <rect x="24" y="26" width="3.2" height="1.4" rx="0.5" fill="#22c55e" transform="rotate(60 24 26)" />
        <rect x="32" y="14" width="3.2" height="1.4" rx="0.5" fill="#f9a8d4" transform="rotate(-40 32 14)" />
      </g>
    );
  }
  if (kind === 'candle') {
    return (
      <g>
        {/* Wax stick */}
        <rect x="30.5" y="9" width="3" height="11" rx="0.5" fill="#fef3c7" stroke="#ca8a04" strokeWidth={0.5} />
        {/* Stripe */}
        <rect x="30.5" y="13" width="3" height="1.5" fill="#fbbf24" />
        {/* Wick */}
        <rect x="31.7" y="6" width="0.6" height="3" fill="#1f2937" />
        {/* Flame — tear-drop ellipse */}
        <ellipse cx="32" cy="4.5" rx="2" ry="3" fill="#fbbf24" />
        <ellipse cx="32" cy="4.5" rx="0.9" ry="1.8" fill="#fef3c7" />
      </g>
    );
  }
  if (kind === 'star') {
    return (
      <g transform="translate(32 14)">
        <polygon
          points="0,-7 2,-2 7,-2 3,1 4.5,6 0,3 -4.5,6 -3,1 -7,-2 -2,-2"
          fill="#fbbf24"
          stroke="#b45309"
          strokeWidth={0.8}
        />
        <circle cx="0" cy="0" r="2" fill="#fde68a" opacity={0.7} />
      </g>
    );
  }
  if (kind === 'rainbow') {
    return (
      <g transform="translate(32 18)">
        {/* Three arches stacked */}
        <path d="M -10 0 A 10 10 0 0 1 10 0" stroke="#fb7185" strokeWidth={2.5} fill="none" />
        <path d="M -7 0 A 7 7 0 0 1 7 0" stroke="#fbbf24" strokeWidth={2.5} fill="none" />
        <path d="M -4 0 A 4 4 0 0 1 4 0" stroke="#3b82f6" strokeWidth={2.5} fill="none" />
        {/* Cloud bumps under each end */}
        <circle cx="-10" cy="0" r="2.5" fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.6} />
        <circle cx="10" cy="0" r="2.5" fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.6} />
      </g>
    );
  }
  return null;
}
