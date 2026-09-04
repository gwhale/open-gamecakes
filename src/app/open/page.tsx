// `/open` — the public explainer for Gamecakes.
//
// Lives OUTSIDE the (gated) route group: no login, no kid profile, nothing
// personal. This is the page you send someone who asks "what is this?" and the
// page a parent lands on before deciding to run their own copy. Unlike /ba it
// IS indexable — being found is the point.
//
// Everything here is static. It must never read the database: a marketing page
// that queries a family's data is one refactor away from leaking it.
//
// Screenshots live in /public/open/. `Shot` renders a labelled frame when a
// file is missing, so the page is honest and readable before the art lands
// rather than showing broken images.
//
// COPY: written in George's voice — short declaratives, contractions, one hard
// number per argument, "not X, it's Y" reframes, no hype. The numbers on this
// page are load-bearing and were read off the code, not estimated:
//
//   24 games       registry.ts, minus the two `retired: true` entries
//   16 words-mode  the `wordsMode: true` count in registry.ts
//   4,900 puzzles  src/components/games/chess-puzzles/library.json length
//   13 / 64 / K-6  town/regions.ts and the CCSS seed migrations
//
// If one of those changes in code, change it here. A marketing page that has
// drifted from the build is worse than no marketing page.

import type { Metadata } from 'next';
import Link from 'next/link';
import GamecakesLogo from '@/components/GamecakesLogo';

export const metadata: Metadata = {
  title: 'Gamecakes — open-source learning games, gated to your child\'s level',
  description:
    'Open-source games for kids where the question is the gate. 24 games in a walkable 3D town across maths, reading and chess, pitched at what your child can actually do and aimable at what their class is covering this month. You host it, you control it, your family\'s data stays yours.',
  robots: { index: true, follow: true },
};

/* ── layout helpers ──────────────────────────────────────────────────── */

function Section({ id, eyebrow, title, children }: {
  id: string; eyebrow: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-4xl scroll-mt-20 px-6 py-14">
      <p className="font-display text-xs uppercase tracking-[0.2em] text-rose-500">{eyebrow}</p>
      <h2 className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

/** A screenshot slot. Renders the image if present, otherwise a labelled frame
 *  describing what belongs there — so the page reads correctly either way. */
function Shot({ src, alt, caption }: { src?: string; alt: string; caption: string }) {
  return (
    <figure className="my-7">
      {src ? (
        /* Screenshots are static, pre-sized files in /public/open. next/image
           would add a loader and layout machinery this page does not need, and
           on Vercel it bills per optimised image for no benefit here. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-700" />
      ) : (
        <div className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <span className="text-2xl" aria-hidden>🖼️</span>
          <span className="font-display text-sm font-semibold text-zinc-500 dark:text-zinc-400">{alt}</span>
        </div>
      )}
      <figcaption className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">{caption}</figcaption>
    </figure>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-4 text-center shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-700">
      <div className="font-display text-3xl font-bold text-rose-500">{n}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  );
}

/** Inline path or identifier. The dev section names real files, and they should
 *  look like files rather than like emphasis. */
function Path({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
      {children}
    </code>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */

export default function OpenPage() {
  return (
    <main className="flex flex-1 flex-col">

      {/* hero */}
      <header className="mx-auto w-full max-w-4xl px-6 pb-4 pt-16 text-center">
        <GamecakesLogo size={84} showTagline wordmarkGradient className="mx-auto" />
        <h1 className="font-display mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
          Games where the question is the gate.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
          Most learning games are a worksheet in a costume. Play for ninety seconds,
          sit through a quiz, go back to playing. Gamecakes doesn&rsquo;t work like
          that. The maze wall has a sum written on it. Answer it and the wall opens.
          The question isn&rsquo;t the toll you pay for the fun. It&rsquo;s the way
          through.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
          It&rsquo;s a walkable cake town with 24 games in it, across maths, reading
          and chess. Every question is pitched at what <em>that child</em> can
          actually do, and it moves as they get better.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
          You run your own copy. Your family&rsquo;s data lives in a database only
          you can reach, you decide what your kids can play, and there is no shop, no
          ads and nobody selling to them. That isn&rsquo;t a promise in a privacy
          policy. It&rsquo;s the architecture.
        </p>

        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n="24" label="games" />
          <Stat n="13" label="town regions" />
          <Stat n="64" label="skills tracked" />
          <Stat n="K–6" label="CCSS aligned" />
        </div>
      </header>

      {/* the town */}
      <Section id="town" eyebrow="The hub" title="A town you walk, not a menu you scroll">
        <p>
          Everything starts in the town. It&rsquo;s a real 3D world. You steer a
          cupcake down frosting streets, past a chess club and a fishing hole and a
          castle, and walk up to a booth to play. Regions start hidden. You open one
          by walking to its edge and paying in cookies you earned by practising.
        </p>
        <Shot src="/open/town.png"
              alt="The 3D town, with a Treehouse Land archway and game booths along a frosting street"
              caption="The hub. Game booths sit along the street; locked regions wait behind their gates until a kid can afford them." />
        <p>
          The map isn&rsquo;t a grid of buttons, and that&rsquo;s deliberate. A kid
          deciding which way to walk is a kid deciding what to practise next. Two of
          the thirteen regions belong to individual kids, who decorate and upgrade
          them.
        </p>
      </Section>

      {/* games */}
      <Section id="games" eyebrow="The games" title="Twenty-four of them, and the maths is load-bearing">
        <p>
          Games are the point of contact, so they have to be worth playing on their
          own. Cake stackers. A crossy-road hopper. A sandcastle you knock down with a
          slingshot. A maze whose gates only open when you solve what&rsquo;s written
          on them. Sharks and minnows. A downhill skier. Some are 2D, some are fully
          3D.
        </p>
        <Shot src="/open/gating.png"
              alt="The Crayon Maze in play: a 3D maze whose walls carry sums like 10 + 10 and 17 + 3"
              caption="Crayon Maze. The sums are on the walls. The question is not a quiz bolted onto a game, it is the way through." />
        <p>
          Sixteen of them carry a <strong>Maths / Words toggle</strong>. The same game
          is an arithmetic game or a reading game depending on what a kid needs today.
          The game doesn&rsquo;t change. The gate does. That is most of the reason
          there are 24 games here and not 48.
        </p>
        <p>
          Two of them were designed by the kids themselves, and the kids own the
          decisions about how those play.
        </p>
      </Section>

      {/* logic: chess and checkers */}
      <Section id="logic" eyebrow="Not just sums" title="Chess Island, and 4,900 puzzles nobody had to write">
        <p>
          Three of the games aren&rsquo;t arithmetic at all. <strong>Chess
          Puzzles</strong>, a full game of <strong>Chess Challenge</strong> against a
          Cakey opponent, and <strong>Cakey Checkers</strong>. They sit on their own
          island and report into a third subject: logic. Maths and reading are the two
          everybody expects. This is the one that changes what the app is for.
        </p>
        <p>
          The puzzle library is <strong>4,900 real positions</strong>, pulled from the
          open lichess database and then cut down hard. Short lines only. Well played
          and well liked. Instructive tactics and mates, nothing cute. Every one of
          them re-checked move by move, so the solution is legal and the mates
          actually mate. They are bucketed by rating from 500 to 1900, 350 to a
          bucket, which gives chess the same steady ramp everything else in the app
          runs on.
        </p>
        <p>
          A kid who has never played and a kid two years in both open a position they
          can solve. That is the whole trick. Both chess games feed one mastery
          number, so grinding tactics counts when they sit down for a full game, and
          checkers keeps its own score because it is its own skill.
        </p>
      </Section>

      {/* question gating */}
      <Section id="difficulty" eyebrow="How it adapts" title="Questions that meet the kid where they are">
        <p>
          Every kid has a grade. Every question carries a target grade. A kid only
          ever sees questions inside a <strong>one-grade band around their own</strong>.
          A kindergartener is never shown 12&nbsp;×&nbsp;12, and a second grader is
          never asked what letter <em>apple</em> starts with. That band is the floor
          and the ceiling. Inside it, difficulty moves.
        </p>
        <Shot src="/open/difficulty.png"
              alt="A game's setup screen: maths or words, a tier picker from 1 to 10 with 5 selected, and the kind of maths"
              caption="Before a round: the tier the child is currently on, and the choice of what to practise. It moves on its own from here." />
        <p>
          Inside the band, each skill has a <strong>tier</strong> from 1 to 10.
          Getting things right moves the tier up. Struggling moves it down. It is
          measured on a rolling window rather than the last answer, so one unlucky
          round doesn&rsquo;t undo a week, and one lucky guess doesn&rsquo;t promote a
          kid past what they can do.
        </p>
        <p>
          Grades advance themselves every August. A parent sets a grade once, and the
          game never quietly serves last year&rsquo;s content because somebody forgot
          to update a field.
        </p>
      </Section>

      {/* aim it at what school is doing */}
      <Section id="aim" eyebrow="Aim it" title="A grade is a guess. You know better.">
        <p>
          Here is what no adaptive engine can know. It can&rsquo;t know your
          kid&rsquo;s class spent October on money. It can&rsquo;t know there is a
          times-tables quiz on Friday. It can&rsquo;t know that fractions are the
          thing causing tears at the kitchen table on a Tuesday night. You know all
          three. So there is a place to say so.
        </p>
        <p>
          Every kid has a <strong>&ldquo;What we&rsquo;re working on&rdquo;</strong>
          {' '}card on the grown-up side. Pin a maths kind: division, fractions,
          shapes, money, place value. Pin a reading kind: rhymes, sight words,
          spelling, context clues, word roots, parts of speech. Pin a level next to
          it, or leave the level alone and let the engine keep driving. Leave the card
          blank and the grade default stands. The override is the exception, not the
          configuration.
        </p>
        <p>
          That is the difference between practice that is roughly the right level and
          practice that is <em>the thing they are stuck on this week</em>. Sixty-four
          skills are tracked, each mapped to the standard it belongs to, across maths,
          reading and logic. You are not picking between two subjects. You are picking
          a target, and the games a kid already plays start serving it on the next
          round. Nobody has to be told they are doing extra work.
        </p>
        <p>
          Then there is the thing that actually came home in the backpack. Paste
          Friday&rsquo;s twelve words into <strong>From school</strong> and those words
          become the questions, at any level, until you switch the list off. What the
          words are FOR is yours to say: spell it, read it, or what it means. The same
          twelve words are a spelling test in second grade and a vocabulary unit in
          fifth, so the app stopped guessing which.
        </p>
        <p>
          Meanings are typed the way you would write them anyway, one per line, as{' '}
          <span className="font-mono text-[13px]">brave = not afraid</span>. The wrong
          answers a kid sees are the other real definitions off the same list, never
          invented ones. A word you have not defined yet is still a perfectly good
          spelling word, and the mode that needs it waits, visibly, until you get to it.
        </p>
        <div className="rounded-xl bg-sky-50 p-5 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:ring-sky-900">
          <h3 className="font-display font-bold text-sky-900 dark:text-sky-100">
            The settings screen isn&rsquo;t the ceiling
          </h3>
          <p className="mt-2 text-sm text-sky-900 dark:text-sky-100">
            You have the code. The question generators are plain functions with tests
            sitting next to them, and the skills catalogue is rows in a database you
            own. If your school teaches something the app doesn&rsquo;t generate yet,
            that is a file you can edit, not a support ticket you file and wait on.
            Nobody else gets to decide what your kids are allowed to practise.
          </p>
        </div>
      </Section>

      {/* sugar tokens */}
      <Section id="tokens" eyebrow="The economy" title="Sugar Tokens, and things worth saving for">
        <p>
          Practice pays. Kids earn <strong>Sugar Tokens</strong> for playing, with a
          bonus when a skill tiers up, and parents can grant extra for things that
          happen away from the screen. Tokens are the only way to get anything.
          Nothing is bought with real money, because there is no shop, no ads and
          nobody to pay.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-5 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900">
            <h3 className="font-display font-bold text-emerald-800 dark:text-emerald-200">Earning</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-emerald-900 dark:text-emerald-100">
              <li>Playing a round. A steady drip, and the bulk of all income</li>
              <li>Tiering up a skill. A bonus for getting genuinely better</li>
              <li>A parent grant, for a chore, a hard week, a kindness</li>
            </ul>
          </div>
          <div className="rounded-xl bg-rose-50 p-5 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:ring-rose-900">
            <h3 className="font-display font-bold text-rose-800 dark:text-rose-200">Spending</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-rose-900 dark:text-rose-100">
              <li>Unlocking a new region of the town</li>
              <li>Cupcake parts, for decorating their character</li>
              <li>Upgrading their own land</li>
              <li>Renting a vehicle, or unlocking a locked game</li>
            </ul>
          </div>
        </div>
        <Shot src="/open/tokens.png"
              alt="The Cakey Store: a land upgrade for 15 tokens, rides from 1 to 5, and cupcake parts at 20 and 40"
              caption="The Cakey Store against a balance of 47. A ride costs a couple of rounds; growing your land costs a week." />
        <p>
          The ladder is tuned so the cheap things are reachable in a sitting and the
          good things take a week. That gap is where the saving happens, and saving is
          most of the point.
        </p>
      </Section>

      {/* tickets */}
      <Section id="tickets" eyebrow="The Story Oven" title="Kids file tickets, and the tickets are real">
        <p>
          Every game has a button that lets a kid say something is broken, or that
          they want something different. It goes into <strong>the Story Oven</strong>,
          their own queue, in their own words, which they can check whenever they
          like.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { e: '🥣', l: 'In the mixing bowl', d: 'Filed. Somebody has read it.' },
            { e: '🔥', l: 'In the oven', d: 'Being built right now.' },
            { e: '🧁', l: 'Fresh out of the oven!', d: 'Shipped. Go and look.' },
            { e: '🍽️', l: 'Saved for later', d: 'A good idea, not yet.' },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-white/70 p-4 text-center shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-700">
              <div className="text-2xl" aria-hidden>{s.e}</div>
              <div className="font-display mt-1 text-sm font-bold">{s.l}</div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{s.d}</div>
            </div>
          ))}
        </div>
        <Shot src="/open/tickets.png"
              alt="A kid's Story Oven: two tickets with baking-stage trackers, one shipped with a note back from the baker"
              caption="A kid's own queue, read-only on purpose. Filing an idea is not the same as commanding one. The shipped one carries a note back." />
        <p>
          When the thing they asked for ships, it shows up in the dev log with a
          <strong> &ldquo;🧁 You baked this!&rdquo;</strong> badge on it. Seeing your
          own idea in the list of what got built is the entire reason the feature
          exists. Kids learn that ideas get triaged, that some wait, and that shipping
          is a thing which happens to people who ask.
        </p>
      </Section>

      {/* parent */}
      <Section id="parents" eyebrow="For grown-ups" title="A dashboard that answers the actual question">
        <p>
          The parent side sits behind a grown-up PIN, and the elevation expires on its
          own. A kid holding the iPad gets the PIN screen, never the dashboard,
          because the honest answer to &ldquo;how is my kid doing&rdquo; is not
          something they should read over your shoulder.
        </p>
        <Shot src="/open/parent.png"
              alt="The parent dashboard: skills with CCSS codes, each marked on track, a tier to go, or above grade level"
              caption="Each skill against its grade-level tier, with the standard it maps to. Not a stream of scores." />
        <p>
          <strong>Add as many kids as you like.</strong> There is no limit and no
          per-child cost. Each one gets their own profile, PIN, grade, token balance
          and progress, tracked separately. It was built for two, but nothing in it
          counts to two. (The town currently has two decoratable per-kid lands; every
          other part of the game scales to as many children as you add.)
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Where they actually are.</strong> Each skill against its
            grade-level tier, above or at or below, rather than a percentage that
            means nothing.
          </li>
          <li>
            <strong>What to work on.</strong> Pin the maths and reading kinds their
            class is covering right now, and the games follow.
          </li>
          <li>
            <strong>From school.</strong> Paste this week&rsquo;s word list and say what
            it is for: spelling, reading, or meanings. Those words become the questions.
          </li>
          <li>
            <strong>Observations.</strong> Note what you saw off-screen. Photograph a
            page of homework and the form fills itself in from the picture.
          </li>
          <li>
            <strong>Sugar Token grants.</strong> Reward the things the game cannot see.
          </li>
          <li>
            <strong>Their tickets.</strong> Read what your kid filed, and decide what
            gets baked.
          </li>
        </ul>
      </Section>

      {/* more dev */}
      <Section id="dev" eyebrow="More dev" title="Two of the contributors are agents, and they ship with the repo">
        <p>
          Adding a game is a known path. There is a guide, a registry entry, a booth
          placed somewhere in the town, and a review bar that cares about one thing:
          whether a child has a better time. A game that can&rsquo;t be walked up to
          isn&rsquo;t shipped.
        </p>
        <p>
          The less usual part is that two of the people who help build them are
          checked into version control. <Path>.claude/agents/</Path> holds a{' '}
          <strong>creative director</strong> and a <strong>three.js engineer</strong>,
          and they come down with the clone.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-violet-50 p-5 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:ring-violet-900">
            <h3 className="font-display font-bold text-violet-900 dark:text-violet-100">
              The creative director
            </h3>
            <p className="mt-2 text-sm text-violet-900 dark:text-violet-100">
              Owns how the town looks. Terrain, paths, region gates, booths, foliage,
              signs, lighting, motion. It knows the real palette, the real characters
              and the real renderer, so it answers with a file and a decision instead
              of &ldquo;make it more whimsical.&rdquo; It also knows the constraints,
              which is why it won&rsquo;t hand you an effect that dies on a tablet or
              buries the gameplay under itself.
            </p>
          </div>
          <div className="rounded-xl bg-teal-50 p-5 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:ring-teal-900">
            <h3 className="font-display font-bold text-teal-900 dark:text-teal-100">
              The three.js engineer
            </h3>
            <p className="mt-2 text-sm text-teal-900 dark:text-teal-100">
              Owns how it is built. The walkable town engine and the dozen game
              engines under it are hand-written, imperative three.js. No
              React-Three-Fiber, no physics engine, no asset pipeline. It knows that,
              and it knows the specific ways this codebase bites: what leaks between
              rounds, what quietly drops frames, what has to be torn down by hand.
            </p>
          </div>
        </div>
        <p>
          They split the way a good studio splits. What colour, what shape, what mood
          belongs to the director. How is this built, why is it slow, what leaked
          belongs to the engineer. Ask the wrong one and it will tell you so.
        </p>
        <p>
          That is the reason they live in git rather than in somebody&rsquo;s chat
          history. The next person to build a game starts holding the context instead
          of spending a weekend rediscovering it. Your own games go in{' '}
          <Path>registry.local.ts</Path>, a file upstream never edits, so you can
          build for your kids and still take every update without a merge conflict.
        </p>
      </Section>

      {/* open source */}
      <Section id="open" eyebrow="Open source" title="Run it for your own kids">
        <p>
          Gamecakes is MIT licensed and built to be forked. You bring your own
          database, which means your children&rsquo;s data sits in a project only you
          can reach. Not on somebody else&rsquo;s server, and not in an account that
          can be sold.
        </p>
        <p>
          Setup is a template, a config file and one command. There is no code to edit
          to add your own kids.
        </p>

        <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
          <h3 className="font-display font-bold text-amber-900 dark:text-amber-100">
            What you need
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-amber-900 dark:text-amber-100">
            <li>
              <strong>A Supabase project.</strong> This is where your family&rsquo;s
              data lives, and it is the reason nobody else can see it. The free tier
              is plenty for a household.
            </li>
            <li>
              <strong>Somewhere to host it.</strong> Vercel is the path of least
              resistance and its free tier runs this fine. Anywhere that serves a
              Next.js app works, including a machine in your house.
            </li>
            <li>
              <strong>About fifteen minutes</strong>, once.
            </li>
          </ul>
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            Both have free tiers that cover normal family use. Gamecakes itself costs
            nothing and asks for no payment details. There is nobody to pay.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="https://github.com/gwhale/open-gamecakes"
             className="font-display rounded-full bg-rose-500 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-rose-600">
            Get it on GitHub
          </a>
          <Link href="/"
                className="font-display rounded-full bg-zinc-200 px-6 py-3 font-bold text-zinc-800 transition hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
            Back to Gamecakes
          </Link>
        </div>
        <p className="pt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The code is free to use and change. The name Gamecakes, the character Cakey
          and the logo are not. Run your copy under your own name.
        </p>
      </Section>

      <footer className="mx-auto w-full max-w-4xl px-6 pb-16 pt-4 text-center text-sm text-zinc-400">
        Built for two kids, and then for yours.
      </footer>
    </main>
  );
}
