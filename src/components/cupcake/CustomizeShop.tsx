'use client';

// CustomizeShop — the cupcake-customization client UI.
//
// Layout:
//   - Big cupcake preview at the top (renders current working config)
//   - Wallet pill (live balance) with spend-pulse animation
//   - 4 tabs (Wrapper / Frosting / Topping / Variety) — switch via
//     pill buttons at top of the catalog. Active tab persists in the
//     URL as ?tab=topping so refresh + back-button work
//   - Catalog grid for the active tab — each option is a tappable
//     card. Owned options apply on tap; tapping a LOCKED option tries it
//     on (previews it on the big cupcake) — it's only bought when the kid
//     confirms in the try-on bar. No coins are spent on tap.
//   - Confetti burst + SFX chime when a new option unlocks
//
// State:
//   - workingConfig: kid's current cupcake (what the preview shows)
//   - balance: live token balance
//   - owned: set of "kind:value" strings the kid has unlocked
//   - walletPulse: transient flag that triggers wallet-pill pulse +
//     floating "-N" coin counter when balance decreases
//   - confettiKey: timestamp incremented on each successful unlock so
//     React remounts the confetti layer and the CSS animation re-fires
//
// Network:
//   - POST /api/cupcake/unlock { kind, value } ONLY when the kid confirms
//     "Buy" in the try-on bar — debits tokens, returns new balance + adds
//     to owned. Tapping a locked card just previews; it never posts here.
//   - POST /api/cupcake/apply { ...workingConfig } after every applied
//     change (owned tap, or a just-bought option) — saves the kid's choice
//     atomically. Treated as fire-and-forget; the UI updates optimistically.

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  type CupcakeConfig,
  type UnlockCost,
  PLAIN_CUPCAKE,
  UNLOCK_CATALOG,
} from '@/lib/cupcake/config';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import { SprinkleDecor } from '@/components/ui/SprinkleDecor';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { playTap, playLevelUp, playWrong } from '@/lib/games/shared/sounds';
import { hapticTap, hapticSuccess, hapticWrong } from '@/lib/haptics';
import KidProfilePanel, { type LedgerRow } from '@/components/cupcake/KidProfilePanel';
import LandEvolutionPanel from '@/components/town/LandEvolutionPanel';
import GaragePanel from '@/components/town/GaragePanel';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import AnimatedCoinCount from '@/components/wallet/AnimatedCoinCount';
import type { VehicleKind } from '@/lib/town/vehicles';
import type { SubjectProgress } from '@/lib/mastery/subject-progress';

interface UnlockRow {
  kind: 'base' | 'wrapper' | 'frosting' | 'topping' | 'variety';
  value: string;
}

export interface CustomizeShopProps {
  kidName: string;
  initialConfig: CupcakeConfig;
  initialUnlocks: UnlockRow[];
  initialBalance: number;
  /** Wallet snapshot for the profile card (balance mirrors initialBalance). */
  wallet: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    recent: LedgerRow[];
  };
  /** Simplified per-subject progress for the profile card. */
  progress: {
    math: SubjectProgress;
    reading: SubjectProgress;
  };
  isGuest: boolean;
  /** The land this kid owns (kids.land_slug), for the
   *  "My Land" evolution section. Null when the kid owns no land or is a guest. */
  ownedLand: { slug: string; name: string; level: number } | null;
  /** Vehicle kinds the kid currently holds a valid rental for — seeds the
   *  Cakey Garage panel's "Rented" state. Empty for guests. */
  rentals: VehicleKind[];
}

type TabKey = 'base' | 'wrapper' | 'frosting' | 'topping' | 'variety';

const TABS: Array<{ key: TabKey; label: string; emoji: string }> = [
  { key: 'base',     label: 'Base',     emoji: '🧁' },
  { key: 'wrapper',  label: 'Wrapper',  emoji: '🎀' },
  { key: 'frosting', label: 'Frosting', emoji: '🍦' },
  { key: 'topping',  label: 'Topping',  emoji: '🍒' },
  { key: 'variety',  label: 'Variety',  emoji: '✨' },
];

// Display labels for each option value. The display label is purely
// cosmetic; the canonical value is stored on cupcake_config + in the
// unlocks table.
const VALUE_LABELS: Record<string, string> = {
  // Bases
  cupcake: 'Cupcake',
  cakepop: 'Cake Pop',
  layered: 'Layered Cake',
  // Wrappers
  plain: 'Plain',
  vanilla: 'Vanilla',
  chocolate: 'Chocolate',
  strawberry: 'Strawberry',
  mint: 'Mint',
  lemon: 'Lemon',
  // Frostings (overlaps with wrappers on 'mint', 'chocolate'; we use
  // a separate map keyed by `${kind}:${value}` for safety in render)
  white: 'White',
  pink: 'Pink',
  blue: 'Blue',
  // Toppings
  none: 'None',
  cherry: 'Cherry',
  sprinkles: 'Sprinkles',
  candle: 'Candle',
  star: 'Star',
  rainbow: 'Rainbow',
  // Varieties
  classic: 'Classic',
  tall: 'Tall',
  mini: 'Mini',
  fancy: 'Fancy',
};

/** All options per dimension, in display order. Free options come first. */
const ALL_OPTIONS: Record<TabKey, ReadonlyArray<string>> = {
  base:     ['cupcake', 'cakepop', 'layered'],
  wrapper:  ['plain', 'vanilla', 'chocolate', 'strawberry', 'mint', 'lemon'],
  frosting: ['white', 'pink', 'mint', 'blue', 'lemon', 'chocolate'],
  topping:  ['none', 'cherry', 'sprinkles', 'candle', 'star', 'rainbow'],
  variety:  ['classic', 'tall', 'mini', 'fancy'],
};

function isFreeOption(kind: TabKey, value: string): boolean {
  return (PLAIN_CUPCAKE as Record<TabKey, string>)[kind] === value;
}

function findCost(kind: TabKey, value: string): UnlockCost | undefined {
  return UNLOCK_CATALOG.find((c) => c.kind === kind && c.value === value);
}

export default function CustomizeShop({
  kidName,
  initialConfig,
  initialUnlocks,
  initialBalance,
  wallet,
  progress,
  isGuest,
  ownedLand,
  rentals,
}: CustomizeShopProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab persists in the URL — kid can refresh, back-button, or share a
  // link to "the topping shop" and the right tab opens. Defaults to
  // 'wrapper' when no param is set.
  const tabFromUrl = ((): TabKey => {
    const raw = searchParams.get('tab');
    if (raw === 'base' || raw === 'wrapper' || raw === 'frosting' || raw === 'topping' || raw === 'variety') {
      return raw;
    }
    return 'base';
  })();

  const [config, setConfig] = useState<CupcakeConfig>(initialConfig);
  const [balance, setBalance] = useState(initialBalance);
  const [owned, setOwned] = useState<Set<string>>(
    () => new Set(initialUnlocks.map((u) => `${u.kind}:${u.value}`)),
  );
  const [tab, setTab] = useState<TabKey>(tabFromUrl);
  const [pendingUnlock, setPendingUnlock] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** A locked option the kid is *trying on* (previewing on the big cupcake)
   *  but has NOT bought yet. Buying happens only when they tap "Buy" in the
   *  try-on bar — tapping a locked treat never spends coins on its own. */
  const [tryOn, setTryOn] = useState<{ kind: TabKey; value: string } | null>(null);
  /** Triggered when balance decreases. `key` re-mounts the spend
   *  counter so the CSS keyframe replays on each unlock. */
  const [walletPulse, setWalletPulse] = useState<{ amount: number; key: number } | null>(null);
  /** Bumps on each successful unlock so the confetti layer re-mounts. */
  const [confettiKey, setConfettiKey] = useState(0);

  /** Profile card (progress bars + wallet history) — toggled by tapping the
   *  coin pill. Collapsed by default so it never crowds the shop. */
  const [showCard, setShowCard] = useState(false);
  /** Live ledger + lifetime-spent, so a purchase updates the wallet history
   *  in place without a page reload. */
  const [recent, setRecent] = useState<LedgerRow[]>(wallet.recent);
  const [totalSpent, setTotalSpent] = useState(wallet.totalSpent);

  const onChangeTab = useCallback(
    (next: TabKey): void => {
      setTab(next);
      setErrorMessage(null);
      setTryOn(null); // a try-on from another tab shouldn't linger here
      // Update URL without scroll-to-top. Replace (not push) so the
      // back button takes the kid back to /town, not through every
      // tab they visited.
      router.replace(`?tab=${next}`, { scroll: false });
    },
    [router],
  );

  // Apply a working config change atomically: optimistically set the
  // state then POST. On failure the optimistic update stays — the
  // server is the source of truth on the next page load, and the
  // failure mode (couldn't save preference) is mild.
  const applyConfig = useCallback(async (next: CupcakeConfig): Promise<void> => {
    setConfig(next);
    if (isGuest) return; // sandbox can't save state
    try {
      await fetch('/api/cupcake/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      // ignore — kid sees the preview either way
    }
  }, [isGuest]);

  const onSelectOption = useCallback(
    async (kind: TabKey, value: string): Promise<void> => {
      setErrorMessage(null);
      const free = isFreeOption(kind, value);
      const isOwned = owned.has(`${kind}:${value}`);

      if (free || isOwned) {
        // Already owned — free to wear, so apply straight away and drop any
        // in-progress try-on. No coins involved.
        playTap();
        hapticTap();
        setTryOn(null);
        const next = { ...config, [kind]: value } as CupcakeConfig;
        await applyConfig(next);
        return;
      }

      // Locked — TRY IT ON, don't buy. Preview it on the big cupcake and show
      // the Buy bar; the purchase only happens when the kid confirms there.
      const item = findCost(kind, value);
      if (!item) {
        setErrorMessage('That option is not available.');
        return;
      }
      if (isGuest) {
        setErrorMessage('Sandbox cupcakes stay plain.');
        return;
      }
      playTap();
      hapticTap();
      setTryOn({ kind, value });
    },
    [config, owned, isGuest, applyConfig],
  );

  // Actually buy the option currently being tried on. This is the ONLY path
  // that spends coins (POST /api/cupcake/unlock) — reached only from the
  // "Buy" button in the try-on bar.
  const confirmBuy = useCallback(async (): Promise<void> => {
    if (!tryOn) return;
    const { kind, value } = tryOn;
    const item = findCost(kind, value);
    if (!item) {
      setErrorMessage('That option is not available.');
      setTryOn(null);
      return;
    }
    if (isGuest) {
      setErrorMessage('Sandbox cupcakes stay plain.');
      return;
    }
    if (balance < item.cost) {
      playWrong();
      hapticWrong();
      setErrorMessage(`You need 🪙 ${item.cost} to unlock that.`);
      return;
    }

    setPendingUnlock(`${kind}:${value}`);
    try {
      const res = await fetch('/api/cupcake/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      if (!res.ok) {
        playWrong();
        hapticWrong();
        const err = await res.json().catch(() => ({ error: 'unknown' }));
        setErrorMessage(
          err.error === 'insufficient_balance'
            ? `Not enough Sugar Tokens (need 🪙 ${item.cost}).`
            : 'Could not unlock — try again.',
        );
        return;
      }
      const data = (await res.json()) as { balance: number };
      // Celebration sequence: confetti + chime + haptic + wallet pulse.
      setBalance(data.balance);
      setWalletPulse({ amount: -item.cost, key: Date.now() });
      setConfettiKey((k) => k + 1);
      // Keep the profile-card wallet history live: prepend the spend + bump
      // lifetime-spent so the ledger matches the server without a reload.
      const now = Date.now();
      setRecent((prev) => [
        {
          id: `local-${now}`,
          delta: -item.cost,
          reason: 'cupcake_unlock',
          metadata: { kind, value },
          created_at: new Date(now).toISOString(),
        },
        ...prev,
      ]);
      setTotalSpent((s) => s + item.cost);
      playLevelUp();
      hapticSuccess();
      window.setTimeout(() => setWalletPulse(null), 1200);
      setOwned((prev) => {
        const next = new Set(prev);
        next.add(`${kind}:${value}`);
        return next;
      });
      // Now that it's owned, wear it — and clear the try-on.
      const next = { ...config, [kind]: value } as CupcakeConfig;
      await applyConfig(next);
      setTryOn(null);
    } catch {
      playWrong();
      hapticWrong();
      setErrorMessage('Network blip — try again.');
    } finally {
      setPendingUnlock(null);
    }
  }, [tryOn, config, balance, isGuest, applyConfig]);

  // The big preview shows the tried-on option (if any) layered over the worn
  // config, so "try on" is literal — the kid sees themselves in it before buying.
  const previewBigConfig: CupcakeConfig = tryOn
    ? ({ ...config, [tryOn.kind]: tryOn.value } as CupcakeConfig)
    : config;
  const tryOnCost = tryOn ? findCost(tryOn.kind, tryOn.value)?.cost ?? null : null;
  const canAffordTryOn = tryOnCost === null ? false : balance >= tryOnCost;

  const activeOptions = useMemo(() => ALL_OPTIONS[tab], [tab]);

  // A land upgrade spends from the SAME wallet as cupcake unlocks, so mirror
  // the buy side-effects here (pulse + ledger + lifetime-spent) to keep the
  // shared coin pill and history in sync without a reload.
  const onLandUpgraded = useCallback((newBalance: number, cost: number): void => {
    setBalance(newBalance);
    setWalletPulse({ amount: -cost, key: Date.now() });
    setTotalSpent((s) => s + cost);
    setRecent((r) => [
      {
        id: `local-land-${Date.now()}`,
        delta: -cost,
        reason: 'land_upgrade',
        metadata: {},
        created_at: new Date().toISOString(),
      },
      ...r,
    ]);
  }, []);

  // Same wallet-sync as a land upgrade, for a vehicle rental (Cakey Garage panel).
  const onVehicleRented = useCallback((newBalance: number, cost: number): void => {
    setBalance(newBalance);
    setWalletPulse({ amount: -cost, key: Date.now() });
    setTotalSpent((s) => s + cost);
    setRecent((r) => [
      {
        id: `local-rental-${Date.now()}`,
        delta: -cost,
        reason: 'vehicle_rental',
        metadata: {},
        created_at: new Date().toISOString(),
      },
      ...r,
    ]);
  }, []);

  return (
    <main className="relative flex flex-1 flex-col items-center overflow-hidden bg-gradient-to-br from-rose-50 via-amber-50 to-sky-100 p-4 sm:p-6 dark:from-zinc-950 dark:to-zinc-900">
      <SprinkleDecor density="corners" />

      {/* Header — kid name + wallet + back link */}
      <header className="relative z-10 flex w-full max-w-2xl items-center justify-between">
        <ChromeNavLink href="/town" variant="light" size="sm">
          ← Town
        </ChromeNavLink>
        <h1 className="font-display text-2xl font-bold text-zinc-900 sm:text-3xl">
          🧁 Cakey Store
        </h1>
        <button
          type="button"
          onClick={() => { playTap(); setShowCard((v) => !v); }}
          className={`relative flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/90 px-3 py-2 font-bold text-amber-900 shadow-sm transition-transform duration-200 active:scale-95 ${walletPulse ? 'animate-[wallet-pulse_700ms_ease-out]' : ''}`}
          aria-label={`Wallet: ${balance} Sugar Tokens. Tap to see progress and history`}
          aria-expanded={showCard}
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          <SugarTokenIcon />
          <AnimatedCoinCount value={balance} className="font-mono tabular-nums" />
          <span aria-hidden className="text-[10px] opacity-70">{showCard ? '▲' : '▼'}</span>
          {walletPulse ? (
            <span
              key={walletPulse.key}
              aria-hidden
              className="pointer-events-none absolute -bottom-1 right-1 font-display text-base font-extrabold text-rose-600"
              style={{ animation: 'spend-float 1100ms ease-out forwards' }}
            >
              {walletPulse.amount}
            </span>
          ) : null}
        </button>
      </header>

      {/* Profile card — progress bars + wallet history. Toggled by the coin
          pill; collapsed by default so the shop stays the focus. */}
      {showCard ? (
        <div className="relative z-10 mt-4 flex w-full justify-center">
          <KidProfilePanel
            balance={balance}
            totalEarned={wallet.totalEarned}
            totalSpent={totalSpent}
            recent={recent}
            math={progress.math}
            reading={progress.reading}
          />
        </div>
      ) : null}

      {/* My Land — evolution ladder (owner kids only). */}
      {ownedLand && !isGuest ? (
        <LandEvolutionPanel
          ownedLand={ownedLand}
          balance={balance}
          onUpgraded={onLandUpgraded}
        />
      ) : null}

      {/* Cakey Garage — rent cake rides (real kids only; guests rent from the
          in-town kiosk, which tracks them locally). */}
      {!isGuest ? (
        <GaragePanel
          balance={balance}
          initialRentals={rentals}
          onRented={onVehicleRented}
        />
      ) : null}

      {/* Live preview — wrapped in a relative container so the confetti
          layer can sit absolutely above it on unlock. */}
      <div className="relative z-10 mt-6 flex flex-col items-center">
        <div className={`relative rounded-3xl bg-white/70 p-6 shadow-xl backdrop-blur-sm ${tryOn ? 'ring-4 ring-amber-300 ring-offset-2' : ''}`}>
          <CupcakeAvatar config={previewBigConfig} size={160} />
          {/* "Trying on" ribbon — makes it obvious this look isn't bought yet. */}
          {tryOn ? (
            <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-950 shadow" style={{ animation: 'wearing-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              👀 Trying on
            </span>
          ) : null}
          {/* Confetti — 14 colored squares fan out and fade. Remounts
              on each successful unlock so the CSS keyframe replays. */}
          {confettiKey > 0 ? (
            <ConfettiBurst key={confettiKey} />
          ) : null}
        </div>

        {/* Try-on / Buy bar — the "before you buy" step. Only appears while a
            locked treat is being previewed; this is the sole place coins are
            spent. */}
        {tryOn ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50/95 px-3 py-2 shadow-md">
            <span className="text-sm font-semibold text-amber-900">
              {VALUE_LABELS[tryOn.value] ?? tryOn.value} looks good on you!
            </span>
            <button
              type="button"
              onClick={confirmBuy}
              disabled={pendingUnlock !== null || !canAffordTryOn}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              {pendingUnlock !== null
                ? 'Buying…'
                : canAffordTryOn
                  ? `Buy for 🪙 ${tryOnCost}`
                  : `Need 🪙 ${tryOnCost}`}
            </button>
            <button
              type="button"
              onClick={() => { setTryOn(null); setErrorMessage(null); }}
              aria-label="Cancel try-on"
              className="rounded-full bg-white px-3 py-2 text-sm font-bold text-zinc-600 shadow-sm transition active:scale-95 hover:bg-zinc-50"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              ✕
            </button>
          </div>
        ) : null}

        {isGuest ? (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Sandbox cupcakes can&rsquo;t be customized
          </p>
        ) : null}
      </div>

      {/* Error banner (transient) */}
      {errorMessage ? (
        <div
          role="alert"
          className="relative z-10 mt-4 rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800 shadow-sm"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Tabs */}
      <nav className="relative z-10 mt-6 flex w-full max-w-2xl gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChangeTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-sm font-bold shadow-sm transition-all active:scale-95 ${
                active
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'bg-white/80 text-zinc-700 hover:bg-white'
              }`}
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              <span aria-hidden>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Catalog grid for active tab */}
      <section className="relative z-10 mt-4 w-full max-w-2xl">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {activeOptions.map((value) => {
            const free = isFreeOption(tab, value);
            const isOwned = owned.has(`${tab}:${value}`);
            const cost = free ? null : findCost(tab, value)?.cost ?? null;
            const isSelected = (config as Record<TabKey, string>)[tab] === value;
            const accessible = free || isOwned;
            const pendingKey = `${tab}:${value}`;
            const isPending = pendingUnlock === pendingKey;
            const canAfford = cost === null ? true : balance >= cost;
            const isTryingOn = tryOn?.kind === tab && tryOn?.value === value;

            // Preview config for this option — the swatch shows what
            // the kid's cupcake would look like with this option
            // applied, leaving everything else from the working config
            // alone. Makes the picker read as "how would I look in
            // this?" not "abstract list of strings."
            const previewConfig: CupcakeConfig = {
              ...config,
              [tab]: value,
            } as CupcakeConfig;

            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => onSelectOption(tab, value)}
                  disabled={isPending || isGuest}
                  className={`group relative flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 p-2 shadow-sm transition-all active:scale-95 ${
                    isSelected
                      ? 'border-rose-400 bg-rose-50 shadow-md'
                      : isTryingOn
                        ? 'border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300'
                        : accessible
                          ? 'border-transparent bg-white/85 hover:border-rose-200 hover:shadow-md'
                          : canAfford
                            ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                            : 'border-zinc-200 bg-zinc-50 opacity-60'
                  } disabled:cursor-not-allowed disabled:hover:shadow-sm`}
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  <CupcakeAvatar config={previewConfig} size={60} />
                  <span className="font-display text-xs font-bold text-zinc-700">
                    {VALUE_LABELS[value] ?? value}
                  </span>
                  {/* Lock/cost badge — visible only on locked items. Shows the
                      price by default, or the try-on/buying state when active. */}
                  {!accessible ? (
                    <span
                      className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isTryingOn
                          ? 'bg-amber-500 text-white'
                          : canAfford
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-zinc-300 text-zinc-700'
                      }`}
                    >
                      {isPending ? 'buying…' : isTryingOn ? '👀 trying on' : `🪙 ${cost}`}
                    </span>
                  ) : isSelected ? (
                    // `key` includes the value so React remounts the
                    // badge when the kid switches to a new option,
                    // making the CSS pop-in animation re-fire.
                    <span
                      key={`wearing-${tab}-${value}`}
                      className="mt-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
                      style={{ animation: 'wearing-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                    >
                      Wearing
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Footer hint */}
      <p className="relative z-10 mt-6 max-w-md text-center text-xs text-zinc-600">
        Tap a treat to try it on, {kidName}! Locked treats cost Sugar Tokens you earn from playing games.
      </p>

      {/* Local CSS keyframes — kept inline so the animations ship with
          the component and aren't dependent on Tailwind config. */}
      <style>{`
        @keyframes wallet-pulse {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.18); box-shadow: 0 0 0 6px rgba(252, 211, 77, 0.4); }
          100% { transform: scale(1); }
        }
        @keyframes spend-float {
          0%   { transform: translateY(0)    scale(0.9); opacity: 0; }
          15%  { transform: translateY(-6px) scale(1.0); opacity: 1; }
          100% { transform: translateY(-40px) scale(0.9); opacity: 0; }
        }
        @keyframes wearing-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1.0);  opacity: 1; }
        }
        @keyframes confetti-fly {
          0%   { transform: translate(0, 0) rotate(0); opacity: 1; }
          100% { transform: translate(var(--cf-x), var(--cf-y)) rotate(var(--cf-r)); opacity: 0; }
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ConfettiBurst — 14 colored squares fan out and fade.
//
// Each piece carries its own CSS variables for translate + rotation
// so the keyframe (`confetti-fly`) can drive every piece with one
// animation definition. Trigger by mounting (caller bumps the key
// prop on each unlock).
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  '#fb7185', '#fbbf24', '#86efac', '#93c5fd',
  '#f9a8d4', '#c4b5fd', '#ffffff',
];

function ConfettiBurst(): React.ReactElement {
  // 14 pieces — enough to read as a burst, cheap to render.
  //
  // useMemo, not a bare Array.from: Math.random() during render is impure, so
  // every re-render of a parent reshuffled the burst mid-animation and the
  // confetti visibly jumped. Computing once per mount is also what the comment
  // below always assumed was happening.
  const pieces = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    // Deterministic-ish per piece — angle around the circle, random
    // radius + rotation. Picking from a seeded pattern (not Math.random)
    // would let SSR match, but this component only mounts client-side
    // (after a successful unlock POST) so randomness is safe.
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 90 + Math.random() * 50;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius - 20; // bias upward so confetti rises
    const rotate = (Math.random() - 0.5) * 540;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    return { x, y, rotate, color, delay: Math.random() * 80 };
  }), []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 inline-block"
          style={{
            width: 8,
            height: 12,
            backgroundColor: p.color,
            borderRadius: 2,
            // The keyframe reads --cf-x / --cf-y / --cf-r — packing
            // each piece's destination into CSS vars keeps the
            // shared animation definition simple.
            ['--cf-x' as string]: `${p.x}px`,
            ['--cf-y' as string]: `${p.y}px`,
            ['--cf-r' as string]: `${p.rotate}deg`,
            animation: `confetti-fly 900ms ${p.delay}ms cubic-bezier(0.2, 0.7, 0.4, 1) forwards`,
            marginLeft: -4,
            marginTop: -6,
          }}
        />
      ))}
    </div>
  );
}
