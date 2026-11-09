'use client';

// The /admin navigation: a sidebar from `lg` up, a scrolling tab bar above it
// on phones and tablets. Every item is an in-page link, so the page still
// loads in one request and works with JavaScript off; the script only marks
// which section is on screen.

import { useEffect, useState } from 'react';

export interface AdminNavItem {
  id: string;
  label: string;
  /** A small count beside the label, e.g. open tickets. Omitted when 0. */
  badge?: number;
}

function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    // A section counts as current once its top passes the upper third of the
    // screen; the last one that has done so wins.
    const pick = () => {
      const line = window.innerHeight * 0.3;
      let current = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      // At the very bottom the last short sections can never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = els[els.length - 1].id;
      }
      setActive(current);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, [ids]);
  return active;
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {n.toLocaleString('en-US')}
    </span>
  );
}

function SignOut({ className }: { className: string }) {
  return (
    <form action="/api/auth/logout" method="post">
      <button type="submit" className={className} style={{ minHeight: 'var(--min-tap-target)' }}>
        Sign out
      </button>
    </form>
  );
}

export default function AdminNav({ items, build }: { items: AdminNavItem[]; build: string }) {
  const [ids] = useState(() => items.map((i) => i.id));
  const active = useActiveSection(ids);

  return (
    <>
      {/* Sidebar, lg and up. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-5 lg:flex dark:border-zinc-800 dark:bg-zinc-950">
        <p className="px-3 text-lg font-bold">Gamecakes admin</p>
        <p className="px-3 text-xs text-zinc-500 dark:text-zinc-400">Build {build}</p>
        <nav aria-label="Admin sections" className="mt-6 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const on = active === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={on ? 'location' : undefined}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                      on
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                    }`}
                  >
                    {item.label}
                    <Badge n={item.badge} />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <SignOut className="w-full rounded-xl border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900" />
      </aside>

      {/* Tab bar, below lg. */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <p className="font-bold">Gamecakes admin</p>
          <SignOut className="rounded-full border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700" />
        </div>
        <nav aria-label="Admin sections" className="overflow-x-auto px-2 pb-2 pt-1 [scrollbar-width:none]">
          <ul className="flex w-max gap-1">
            {items.map((item) => {
              const on = active === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={on ? 'location' : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
                      on ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {item.label}
                    <Badge n={item.badge} />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
