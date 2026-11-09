// `/about` — what Gamecakes is, shown in pictures with a line or two each.
//
// Outside the (gated) route group, like /play. The technical and open-source story
// is at /open; this page is for a parent deciding whether to try it.
//
// noindex for now, the same as /play: it spreads by being shared.
//
// The pictures come from scripts/dev/about-shots.mjs. They must never show a land
// with a real kid's name on its sign. check:names cannot read pixels; see that script.

import type { Metadata } from 'next';
import Link from 'next/link';
import LevelChart from './LevelChart';

export const metadata: Metadata = {
  title: 'About Gamecakes',
  description: 'A town made of cake, with real games in it.',
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    image: 'island',
    alt: 'An island from above, with grass, paths, a train track and a beach.',
    title: 'Explore a whole island.',
    text: 'Walk around, ride the train, and sail to new lands.',
  },
  {
    image: 'cartridges',
    alt: 'A big game cartridge floating over a town square, with a small cupcake standing nearby.',
    title: 'Every game floats in town.',
    text: 'Walk up to one and play.',
  },
  {
    image: 'puzzle-island',
    alt: 'A small island in a turquoise sea, with game cartridges on a waffle-paved square.',
    title: 'Earn tokens. Open the next island.',
    text: 'Play games to earn Sugar Tokens, then spend them to see what is further out.',
  },
];

const GAME_COVERS = ['math-asteroids', 'word-search', 'chess-puzzles', 'marble-maze', 'hanoi', 'cakey-stacks'];

const linkFocus = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#9f1d48]';

function Picture({ src, alt }: { src: string; alt: string }): React.ReactElement {
  return (
    // Static files from /public, already sized.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={1400}
      height={875}
      className="h-auto w-full rounded-md bg-[#fffdf8] p-1.5 shadow-[0_12px_22px_-8px_rgba(60,30,10,0.55)]"
    />
  );
}

export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col items-center bg-[#f1e6d3] px-4 pb-14 text-[#3b2415]">
      <header className="mt-10 max-w-2xl text-center sm:mt-14">
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          A town made of cake, with real games in it.
        </h1>
        <p className="mt-3 text-lg">For kids who would rather play than do worksheets.</p>
      </header>

      <div className="mt-10 flex w-full max-w-4xl flex-col gap-12 sm:mt-14 sm:gap-16">
        {STEPS.slice(0, 2).map((step) => (
          <section key={step.image}>
            <Picture src={`/about/${step.image}.jpg`} alt={step.alt} />
            <h2 className="mt-4 font-display text-2xl font-bold">{step.title}</h2>
            <p className="mt-1 text-lg">{step.text}</p>
          </section>
        ))}

        <section>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GAME_COVERS.map((slug) => (
              <li key={slug}>
                <Picture src={`/games/covers/${slug}.jpg`} alt="" />
              </li>
            ))}
          </ul>
          <h2 className="mt-4 font-display text-2xl font-bold">Math, reading and logic.</h2>
          <p className="mt-1 text-lg">Questions get easier or harder to fit each kid.</p>
        </section>

        <LevelChart />

        {STEPS.slice(2).map((step) => (
          <section key={step.image}>
            <Picture src={`/about/${step.image}.jpg`} alt={step.alt} />
            <h2 className="mt-4 font-display text-2xl font-bold">{step.title}</h2>
            <p className="mt-1 text-lg">{step.text}</p>
          </section>
        ))}
      </div>

      <section className="mt-14 text-center">
        <h2 className="font-display text-2xl font-bold">Try it.</h2>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/play"
            className={`flex items-center rounded-md bg-[#9f1d48] px-6 font-semibold text-white hover:bg-[#861a3d] ${linkFocus}`}
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Play a game now
          </Link>
          <Link
            href="/signup"
            className={`flex items-center rounded-md border border-[#8a5a33] px-6 font-semibold hover:bg-[#f6ecd9] ${linkFocus}`}
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Make an account
          </Link>
        </div>
        <p className="mt-5">
          <Link href="/open" className={`font-semibold underline ${linkFocus}`}>
            Gamecakes is open source
          </Link>
        </p>
      </section>
    </main>
  );
}
