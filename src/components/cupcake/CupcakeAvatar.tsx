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
  PAINT_COLORS,
  frostingColors,
  wrapperColors,
  VARIETY_TRAITS,
  coerceCupcakeConfig,
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
  config: rawConfig,
  size = 64,
  style,
  ariaLabel,
  className,
}: CupcakeAvatarProps): React.ReactElement {
  // Coerce so a config from before hats/glasses/faces existed still draws.
  const config = coerceCupcakeConfig(rawConfig);
  const traits = VARIETY_TRAITS[config.variety];
  const wrapper = wrapperColors(config);
  const frosting = frostingColors(config);
  const label = ariaLabel ?? describeCupcake(config);

  // Pixel height matches viewBox aspect ratio so callers can rely on
  // the avatar fitting where size is the constraint.
  const heightPx = (size * VIEW_H) / VIEW_W;

  // Where the character parts sit on this base (viewBox units, before the
  // variety scale): eye + mouth height for the face, and the y a hat's brim
  // rests on. Toppings ride on top of a hat.
  const anchor =
    config.base === 'cakepop'
      ? { eyeY: 33, mouthY: 39, hatY: 15, toppingDy: 8 }
      : config.base === 'layered'
        ? { eyeY: 61, mouthY: 66.5, hatY: 26, toppingDy: 6 }
        : { eyeY: 52, mouthY: 59, hatY: traits.frostingStacks === 2 ? 8 : 17, toppingDy: 0 };
  const hatH = HAT_HEIGHT[config.hat];
  // With a hat on, the topping's seat (y=20 in Topping's own coordinates)
  // moves up to the hat's tip.
  const toppingDy = config.hat === 'none' ? anchor.toppingDy : anchor.hatY - hatH + 3 - 20;
  // Shrink the whole treat toward its base when a hat (plus topping) would
  // poke out of the top of the viewBox.
  const contentTop = config.hat === 'none'
    ? 1
    : 40 + (anchor.hatY - hatH - (config.topping === 'none' ? 0 : 14) - 40) * traits.scale;
  const fit = contentTop >= 1 ? 1 : (FIT_BASE_Y - 1) / (FIT_BASE_Y - contentTop);

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
        overflow="visible"
      >
        <g transform={`translate(32 ${FIT_BASE_Y}) scale(${fit}) translate(-32 ${-FIT_BASE_Y})`}>
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
            </>
          ) : config.base === 'cakepop' ? (
            <CakePop colors={frosting} />
          ) : (
            <LayeredCake wrapper={wrapper} frosting={frosting} />
          )}
          <Face kind={config.face} eyeY={anchor.eyeY} mouthY={anchor.mouthY} />
          <GlassesPart kind={config.glasses} eyeY={anchor.eyeY} color={PAINT_COLORS[config.glassesColor]} />
          <HatPart kind={config.hat} baseY={anchor.hatY} color={PAINT_COLORS[config.hatColor]} />
          {/* The topping sits on the swirl tip, nudged down onto the ball or
              top tier for the other bases, or up onto the hat's tip. */}
          <g transform={`translate(0 ${toppingDy})`}>
            <Topping kind={config.topping} />
          </g>
        </g>
        </g>
      </svg>
    </span>
  );
}

/** Plain-English description for screen readers. */
function describeCupcake(c: CupcakeConfig): string {
  return describeTreat(c) + describeCharacter(c);
}

const HAT_WORDS: Record<CupcakeConfig['hat'], string> = {
  none: '', party: 'party hat', beanie: 'beanie', tophat: 'top hat', wizard: 'wizard hat', crown: 'crown',
};
const GLASSES_WORDS: Record<CupcakeConfig['glasses'], string> = {
  none: '', round: 'round glasses', sunnies: 'sunglasses', heart: 'heart glasses', star: 'star glasses',
};
const FACE_WORDS: Record<CupcakeConfig['face'], string> = {
  none: '', smile: 'smiling', grin: 'grinning', wink: 'winking', sleepy: 'sleepy', silly: 'sticking its tongue out',
};

function describeCharacter(c: CupcakeConfig): string {
  const worn = [
    c.hat === 'none' ? '' : `a ${PAINT_COLORS[c.hatColor].label.toLowerCase()} ${HAT_WORDS[c.hat]}`,
    GLASSES_WORDS[c.glasses],
  ].filter(Boolean);
  const wearing = worn.length ? `, wearing ${worn.join(' and ')}` : '';
  const face = FACE_WORDS[c.face] ? `, ${FACE_WORDS[c.face]}` : '';
  return wearing + face;
}

function describeTreat(c: CupcakeConfig): string {
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

// ---------------------------------------------------------------------------
// Character parts — face, glasses, hat.
// ---------------------------------------------------------------------------

/** The point the hat "fit" shrink scales toward (just above the base line). */
const FIT_BASE_Y = 74;

/** How far each hat rises above its brim, in viewBox units. */
const HAT_HEIGHT: Record<CupcakeConfig['hat'], number> = {
  none: 0, party: 16, beanie: 10, tophat: 15, wizard: 20, crown: 9,
};

const INK = '#1f2937';
const EYE_DX = 6;

function Face({
  kind,
  eyeY,
  mouthY,
}: {
  kind: CupcakeConfig['face'];
  eyeY: number;
  mouthY: number;
}): React.ReactElement | null {
  if (kind === 'none') return null;
  const dot = (x: number): React.ReactElement => (
    <ellipse key={`eye${x}`} cx={x} cy={eyeY} rx={1.6} ry={2.1} fill={INK} />
  );
  // A closed eye: a small arc. `up` bulges upward (^).
  const shut = (x: number, up: boolean): React.ReactElement => (
    <path
      key={`shut${x}`}
      d={`M ${x - 2.2} ${eyeY} Q ${x} ${eyeY + (up ? -2.6 : 2.6)} ${x + 2.2} ${eyeY}`}
      stroke={INK}
      strokeWidth={1.1}
      fill="none"
      strokeLinecap="round"
    />
  );
  const L = 32 - EYE_DX;
  const R = 32 + EYE_DX;
  const eyes =
    kind === 'sleepy' ? [shut(L, false), shut(R, false)]
      : kind === 'wink' ? [dot(L), shut(R, true)]
        : [dot(L), dot(R)];
  let mouth: React.ReactElement;
  if (kind === 'grin') {
    mouth = <path d={`M 28 ${mouthY - 1} Q 32 ${mouthY + 6} 36 ${mouthY - 1} Z`} fill="#7f1d1d" />;
  } else if (kind === 'sleepy') {
    mouth = <circle cx={32} cy={mouthY} r={1.3} stroke={INK} strokeWidth={0.9} fill="none" />;
  } else {
    mouth = (
      <>
        {kind === 'silly' ? <ellipse cx={33} cy={mouthY + 2.2} rx={1.8} ry={2.2} fill="#f472b6" /> : null}
        <path d={`M 28.5 ${mouthY} Q 32 ${mouthY + 3.5} 35.5 ${mouthY}`} stroke={INK} strokeWidth={1.1} fill="none" strokeLinecap="round" />
      </>
    );
  }
  return (
    <g>
      <ellipse cx={32 - 11} cy={(eyeY + mouthY) / 2} rx={2.6} ry={1.5} fill="#fb7185" opacity={0.55} />
      <ellipse cx={32 + 11} cy={(eyeY + mouthY) / 2} rx={2.6} ry={1.5} fill="#fb7185" opacity={0.55} />
      {eyes}
      {mouth}
    </g>
  );
}

function GlassesPart({
  kind,
  eyeY,
  color,
}: {
  kind: CupcakeConfig['glasses'];
  eyeY: number;
  color: { hex: string; shade: string };
}): React.ReactElement | null {
  if (kind === 'none') return null;
  const L = 32 - EYE_DX;
  const R = 32 + EYE_DX;
  const lens = (x: number): React.ReactElement => {
    if (kind === 'heart') {
      return (
        <path
          key={x}
          d={`M ${x} ${eyeY + 4} C ${x - 6} ${eyeY} ${x - 4} ${eyeY - 5} ${x} ${eyeY - 2} C ${x + 4} ${eyeY - 5} ${x + 6} ${eyeY} ${x} ${eyeY + 4} Z`}
          fill={color.hex}
          stroke={color.shade}
          strokeWidth={0.7}
        />
      );
    }
    if (kind === 'star') {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 5 : 2.3;
        const a = (i / 10) * Math.PI * 2;
        return `${(x + Math.sin(a) * r).toFixed(2)},${(eyeY - Math.cos(a) * r).toFixed(2)}`;
      }).join(' ');
      return <polygon key={x} points={pts} fill={color.hex} stroke={color.shade} strokeWidth={0.7} />;
    }
    return (
      <circle
        key={x}
        cx={x}
        cy={eyeY}
        r={4.2}
        fill={kind === 'sunnies' ? '#111827' : 'rgba(255,255,255,0.25)'}
        stroke={color.hex}
        strokeWidth={1.4}
      />
    );
  };
  return (
    <g>
      <line x1={L + 3.5} y1={eyeY - 0.5} x2={R - 3.5} y2={eyeY - 0.5} stroke={color.hex} strokeWidth={1.2} />
      {lens(L)}
      {lens(R)}
    </g>
  );
}

function HatPart({
  kind,
  baseY,
  color,
}: {
  kind: CupcakeConfig['hat'];
  baseY: number;
  color: { hex: string; shade: string };
}): React.ReactElement | null {
  const y = baseY;
  switch (kind) {
    case 'none':
      return null;
    case 'party':
      return (
        <g>
          <path d={`M 24 ${y} L 32 ${y - 15} L 40 ${y} Z`} fill={color.hex} stroke={color.shade} strokeWidth={0.8} />
          <path d={`M 27 ${y - 5} L 37 ${y - 5}`} stroke="#ffffff" strokeWidth={1.2} opacity={0.7} />
          <circle cx={32} cy={y - 15} r={2.4} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d={`M 21 ${y} Q 21 ${y - 9} 32 ${y - 9} Q 43 ${y - 9} 43 ${y} Z`} fill={color.hex} stroke={color.shade} strokeWidth={0.8} />
          <rect x={20} y={y - 2} width={24} height={4} rx={2} fill={color.shade} />
          <circle cx={32} cy={y - 9.5} r={2.6} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} />
        </g>
      );
    case 'tophat':
      return (
        <g>
          <rect x={25} y={y - 15} width={14} height={14} rx={1} fill={color.hex} stroke={color.shade} strokeWidth={0.8} />
          <rect x={25} y={y - 5} width={14} height={2.5} fill={color.shade} />
          <rect x={20} y={y - 1.5} width={24} height={3} rx={1.5} fill={color.hex} stroke={color.shade} strokeWidth={0.8} />
        </g>
      );
    case 'wizard':
      return (
        <g>
          <path d={`M 24 ${y - 1} Q 30 ${y - 12} 34 ${y - 20} Q 36 ${y - 10} 40 ${y - 1} Z`} fill={color.hex} stroke={color.shade} strokeWidth={0.8} />
          <rect x={23.5} y={y - 4} width={17} height={2.4} fill="#fcd34d" />
          <ellipse cx={32} cy={y} rx={12} ry={2} fill={color.hex} stroke={color.shade} strokeWidth={0.8} />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path
            d={`M 24 ${y} L 24 ${y - 6} L 27 ${y - 3} L 30 ${y - 9} L 32 ${y - 4} L 34 ${y - 9} L 37 ${y - 3} L 40 ${y - 6} L 40 ${y} Z`}
            fill="#fbbf24"
            stroke="#b45309"
            strokeWidth={0.8}
          />
          <circle cx={28} cy={y - 1.8} r={1.3} fill={color.hex} />
          <circle cx={32} cy={y - 1.8} r={1.3} fill={color.hex} />
          <circle cx={36} cy={y - 1.8} r={1.3} fill={color.hex} />
        </g>
      );
  }
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
