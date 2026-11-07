// CandyButton — the candy-shell action button for kid-facing surfaces.
//
// Pick a ROLE, not a colour. The role says what the button does; the token
// layer in globals.css decides how that looks, including the label colour.
// See DESIGN.md's Layer Rule for the full map.
//
//   act    — do the thing (Play, confirm, launch)
//   earn   — currency and reward (buy, spend tokens)
//   grow   — unlock, upgrade, succeed
//   travel — go somewhere (ferry, train, garage, lands)
//   exit   — stop, hop off, close  ← deliberately NOT candy, because
//            stopping isn't an achievement and shouldn't look like one
//
// INK IS NOT A CHOICE. Never pass a text colour. Each role's ink is fixed by
// the luminance of its fill — fills too bright to carry white text take a deep
// ink of their own hue instead. Every pair is verified >= 4.70:1 at BOTH
// gradient stops, which is AA for 16px bold (the smallest these render).
//
// The shell itself — gloss, press, focus ring — lives in `.candy-shell` in
// globals.css, because the focus state has to rewrite the whole shadow stack
// and an inline style can't do that.
//
// Usage:
//   <CandyButton role="act" size="lg">Play again!</CandyButton>
//   <CandyButton role="travel" shape="pill">Ride the Sugar Express</CandyButton>
//   <CandyButton role="exit" shape="pill">Hop off</CandyButton>
//
// `className` is for layout only (margin, width). Don't override the visual
// identity there — that defeats the point of having the component. Note that
// Tailwind `shadow-*` utilities are INERT here: `.candy-shell` sets box-shadow
// from plain CSS, which outranks Tailwind's layered utilities. To change the
// lift, change the role's `--*-glow` token, not the class list.

import { type ButtonHTMLAttributes, type CSSProperties, forwardRef } from 'react';

export type CandyRole = 'act' | 'earn' | 'grow' | 'travel' | 'exit';
export type CandySize = 'sm' | 'md' | 'lg';
/** `rounded` for buttons inside panels and modals; `pill` for anything in the
 *  world or floating over it. Pill is the in-world default. */
export type CandyShape = 'rounded' | 'pill';

export interface CandyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  role?: CandyRole;
  size?: CandySize;
  shape?: CandyShape;
  /** Stretch to the container width — game-over screens stack full-width on
   *  narrow viewports and sit inline from `sm` up. */
  block?: boolean;
}

/** Role → the four shell tokens. Values live in globals.css so any other
 *  consumer (HUD, canvas overlay) reads the same source of truth. */
const ROLE_VARS: Record<CandyRole, CSSProperties> = {
  act: { '--c-from': 'var(--act-from)', '--c-to': 'var(--act-to)', '--c-ink': 'var(--act-ink)', '--c-glow': 'var(--act-glow)' } as CSSProperties,
  earn: { '--c-from': 'var(--earn-from)', '--c-to': 'var(--earn-to)', '--c-ink': 'var(--earn-ink)', '--c-glow': 'var(--earn-glow)' } as CSSProperties,
  grow: { '--c-from': 'var(--grow-from)', '--c-to': 'var(--grow-to)', '--c-ink': 'var(--grow-ink)', '--c-glow': 'var(--grow-glow)' } as CSSProperties,
  travel: { '--c-from': 'var(--travel-from)', '--c-to': 'var(--travel-to)', '--c-ink': 'var(--travel-ink)', '--c-glow': 'var(--travel-glow)' } as CSSProperties,
  exit: { '--c-from': 'var(--exit-from)', '--c-to': 'var(--exit-to)', '--c-ink': 'var(--exit-ink)', '--c-glow': 'var(--exit-glow)' } as CSSProperties,
};

const SIZE_CLASSES: Record<CandySize, string> = {
  sm: 'px-4 py-2 text-sm gap-1.5',
  md: 'px-6 py-3 text-base gap-2',
  lg: 'px-8 py-4 text-lg gap-2.5',
};

/** Panel/modal radius per size. Overridden entirely by `shape="pill"`. */
const RADIUS_CLASSES: Record<CandySize, string> = {
  sm: 'rounded-xl',
  md: 'rounded-2xl',
  lg: 'rounded-2xl',
};

export const CandyButton = forwardRef<HTMLButtonElement, CandyButtonProps>(
  function CandyButton(
    { role = 'act', size = 'md', shape = 'rounded', block = false, className, children, style, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={[
          'candy-shell',
          'relative inline-flex items-center justify-center',
          'font-display font-bold tracking-tight',
          'select-none touch-manipulation',
          // Named properties only — never transition-all.
          'transition-[transform,box-shadow,filter] duration-100 ease-out',
          'hover:brightness-105 active:scale-95',
          // Disabled styling lives in `.candy-shell:disabled` — deliberately not
          // `opacity-50`, which fades the label along with the fill and makes
          // the "why can't I do this" message unreadable. See globals.css.
          'disabled:hover:brightness-100 disabled:active:scale-100',
          block ? 'w-full' : '',
          shape === 'pill' ? 'rounded-full' : RADIUS_CLASSES[size],
          SIZE_CLASSES[size],
          className ?? '',
        ].join(' ')}
        style={{
          ...ROLE_VARS[role],
          minHeight: 'var(--min-tap-target)',
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
