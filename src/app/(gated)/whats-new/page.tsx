// `/whats-new` — kid-facing changelog.
//
// A friendly "here's what's new in Gamecakes" feed. Content comes from the
// WHATS_NEW data module (newest first); this page is just the renderer, styled
// to match /tickets (same sky→white→emerald wash, GamecakesLogo header,
// rounded cards). Lives under (gated) so it inherits the family auth check like
// every other in-game page.

import { WHATS_NEW } from '@/lib/whats-new';
import UpdateCard from '@/components/whats-new/UpdateCard';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';

export default function WhatsNewPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      {/* ---- Header ---- */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={44} />
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              <span className="mr-2 text-3xl sm:text-4xl" aria-hidden>✨</span>
              What&rsquo;s New
            </h1>
            <p className="text-xs text-zinc-500 sm:text-sm">
              Fresh out of the Story Oven — updates baked from your ideas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FullscreenToggle size="sm" />
          <ChromeNavLink href="/town" variant="dark" size="md">← Map</ChromeNavLink>
        </div>
      </header>

      {/* ---- Update list ---- */}
      <section className="px-6 py-6 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {WHATS_NEW.map((entry) => (
            <UpdateCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="px-6 pb-8 text-center">
        <p className="text-xs text-zinc-500">
          Got an idea or a bug? Tap 🧁 Story Oven in any game and we&rsquo;ll bake it!
        </p>
      </footer>
    </main>
  );
}
