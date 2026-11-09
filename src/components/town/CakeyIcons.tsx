// Icons for talking to Cakey — one glyph per thing a kid can say back.
//
// The reply chips used to lead with emoji, which render differently on every
// device and carry no system: a die for trivia, a sock for socks, a clapper
// for stories. These are drawn in one hand, on one 24-unit grid, with one
// stroke weight, so a row of them reads as a set — and a kid who is not yet
// reading fluently can learn "the bolt is the quiz" once and keep it. Each is
// a plain SVG with `currentColor`, so it takes the chip's ink and needs no
// colour of its own.

import type { SVGProps } from 'react';

export type CakeyIconName =
  | 'quiz'
  | 'lightning'
  | 'joke'
  | 'news'
  | 'treasure'
  | 'ride'
  | 'story'
  | 'sock'
  | 'hi'
  | 'bye'
  | 'more'
  | 'back'
  | 'next'
  | 'again';

const PATHS: Record<CakeyIconName, React.ReactNode> = {
  // A question mark in a speech bubble: a question, asked out loud.
  quiz: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M9.6 8.6a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1 .8-1 1.5" />
      <circle cx="12" cy="14.4" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  // A bolt: the lightning round.
  lightning: <path d="M13 2 5 13h6l-1 9 8-12h-6z" />,
  // A laughing face: the mouth is the joke.
  joke: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 13.5h9a4.5 4.5 0 0 1-9 0z" />
      <path d="M8.5 9.5l1.2-1 1.3 1M13 9.5l1.2-1 1.3 1" />
    </>
  ),
  // The Story Oven: an oven door with a window and a knob.
  news: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect x="6.5" y="10" width="11" height="6.5" rx="1.5" />
      <circle cx="8" cy="7" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r=".9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="7" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  // A key: something hidden, something to open.
  treasure: (
    <>
      <circle cx="8" cy="9" r="4" />
      <path d="M11 11.5 20 20.5M17 17.5l2-2M14.5 15l2-2" />
    </>
  ),
  // A steering wheel: a ride.
  ride: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M3.3 11h6M14.7 11h6M12 14.5V21" />
    </>
  ),
  // An open book: a story told again.
  story: (
    <>
      <path d="M3 5.5c3-1.5 6-1.5 9 0v13.5c-3-1.5-6-1.5-9 0z" />
      <path d="M21 5.5c-3-1.5-6-1.5-9 0v13.5c3-1.5 6-1.5 9 0z" />
    </>
  ),
  // A sock. He has a lot to say about socks.
  sock: <path d="M8 3h7v9.5l3.2 2.4a3.5 3.5 0 0 1-4.2 5.6L8.6 16A3 3 0 0 1 8 14.2zM8 7h7" />,
  // A raised hand: hi.
  hi: (
    <>
      <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M16 12v-1.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-5.3-3.2l-2.3-4.4a1.4 1.4 0 0 1 2.4-1.4L7 13" />
    </>
  ),
  // A door, open, with the way out: bye.
  bye: (
    <>
      <path d="M13 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h7" />
      <path d="M16 8l4 4-4 4M20 12H10" />
    </>
  ),
  // Three dots: there is more.
  more: (
    <>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  // A loop arrow: one more.
  again: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
};

export default function CakeyIcon({
  name,
  size = 24,
  className,
  ...rest
}: { name: CakeyIconName; size?: number | string } & Omit<SVGProps<SVGSVGElement>, 'name'>): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
