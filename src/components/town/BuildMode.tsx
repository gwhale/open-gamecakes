'use client';

// Build mode — the 🔨 button and the tray of pieces a kid buys and places on
// the town grid. The engine draws the pieces and the green/red preview and
// checks the terrain; this component owns the money side (the place/remove
// API calls), the family-wide list, and keeping it live across siblings.
//
// Flow: 🔨 (in the host's control column) opens the tray → pick a piece (or 🧹 to remove) → tap the ground to aim
// → ✓ to buy and place. The ✓ only lights when the square works and the kid
// can afford it, and it says why when it can't (not only by colour). A piece
// can be undone free for UNDO_SECS; after that the builder can remove it for
// half back.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TownEngine } from '@/lib/town/three/engine';
import {
  BUILD_CATALOG,
  UNDO_SECS,
  findBuild,
  type BuildKind,
  type BuildProblem,
  type TownBuild,
} from '@/lib/town/builds';
import { joinBuildChannel, type BuildChannelHandle } from '@/lib/realtime/build-channel';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import { ModelTurntable } from '@/components/town/ModelTurntable';
import { playBubble, playTap } from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticTap } from '@/lib/haptics';

export type BuildAim = { gx: number; gy: number; problem: BuildProblem | null };

export interface BuildModeProps {
  engineRef: React.RefObject<TownEngine | null>;
  /** True once the engine exists (it is created asynchronously). */
  engineReady: boolean;
  /** The host routes the engine's onBuildAim callback through this. */
  aimRef: React.MutableRefObject<((aim: BuildAim) => void) | null>;
  initialBuilds: TownBuild[];
  kidId?: string;
  isGuest?: boolean;
  /** Family channel token (see src/lib/realtime/topic.ts); null → poll. */
  topicToken?: string | null;
  balance: number;
  onBalance: (n: number) => void;
  /** The tray is open. The host owns this: its 🔨 button sits with the
   *  other camera controls. */
  open: boolean;
  onClose: () => void;
}

const PROBLEM_TEXT: Record<BuildProblem, string> = {
  taken: 'Something is already here',
  sibling: "That's someone else's land",
  water: 'Too close to the water',
  locked: 'That land is still locked',
  busy: 'Too close to a shop',
  road: "That's on a path",
  empty: 'Nothing to remove here',
};

const GUEST_KEY = 'gc_guest_builds';
/** Without a live channel, re-read the family's builds this often. */
const POLL_MS = 20_000;

function readGuestBuilds(): TownBuild[] {
  try {
    const raw = window.sessionStorage.getItem(GUEST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as TownBuild[]) : [];
  } catch {
    return [];
  }
}
function writeGuestBuilds(list: TownBuild[]): void {
  try {
    window.sessionStorage.setItem(GUEST_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: the builds just won't survive a trip into a game
  }
}

export default function BuildMode(props: BuildModeProps): React.ReactElement | null {
  const { engineRef, engineReady, aimRef, isGuest, kidId, topicToken, onBalance, open, onClose } = props;
  const [tool, setTool] = useState<BuildKind | 'remove'>('road');
  // The piece under the pointer or keyboard focus; the turntable shows it
  // ahead of the chosen one.
  const [peek, setPeek] = useState<BuildKind | null>(null);
  const [rot, setRot] = useState(0);
  const [aim, setAim] = useState<BuildAim | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; until: number } | null>(null);
  const buildsRef = useRef<TownBuild[]>(props.initialBuilds);
  // Render copy of the list (the ref is for callbacks), and when the aim last
  // moved, which is the clock the refund preview reads.
  const [list, setList] = useState<TownBuild[]>(props.initialBuilds);
  const [aimAt, setAimAt] = useState(0);
  const channelRef = useRef<BuildChannelHandle | null>(null);
  const tabId = useRef<string>('');

  const show = useCallback(
    (list: TownBuild[], pop?: string[]) => {
      buildsRef.current = list;
      setList(list);
      engineRef.current?.setBuilds(list, pop);
      if (isGuest) writeGuestBuilds(list);
    },
    [engineRef, isGuest],
  );

  // The engine starts with the server's list; a guest's builds come back from
  // the tab session (they never reach the server).
  useEffect(() => {
    if (!engineReady) return;
    if (isGuest) show(readGuestBuilds());
    else engineRef.current?.setBuilds(buildsRef.current);
  }, [engineReady, isGuest, engineRef, show]);

  /** Re-read the family's builds; new ones grow in. */
  const refresh = useCallback(async () => {
    if (isGuest) return;
    try {
      const r = await fetch('/api/town/builds', { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { builds?: TownBuild[] };
      if (!Array.isArray(d.builds)) return;
      const had = new Set(buildsRef.current.map((b) => b.id));
      show(d.builds, d.builds.filter((b) => !had.has(b.id)).map((b) => b.id));
    } catch {
      // offline for a moment; the next change or poll catches up
    }
  }, [isGuest, show]);

  // Live: siblings' changes arrive on the family channel. Without a channel
  // token (secret unset), poll instead. Either way, catch up when the tab
  // comes back to the front.
  useEffect(() => {
    if (isGuest) return;
    if (!tabId.current) tabId.current = `${kidId ?? 'kid'}:${Math.random().toString(36).slice(2)}`;
    let timer: number | null = null;
    if (topicToken) {
      try {
        channelRef.current = joinBuildChannel(topicToken, tabId.current, () => void refresh());
      } catch {
        channelRef.current = null;
      }
    }
    if (!channelRef.current) {
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, POLL_MS);
    }
    const onVis = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer !== null) window.clearInterval(timer);
      void channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [isGuest, kidId, topicToken, refresh]);

  // Engine → tray: where build mode is aimed and whether it works there.
  useEffect(() => {
    aimRef.current = (a) => {
      setAim(a);
      setAimAt(Date.now());
      setError(null);
    };
    return () => {
      aimRef.current = null;
    };
  }, [aimRef]);

  // Keep the engine's tool in step with the tray.
  useEffect(() => {
    if (!engineReady) return;
    engineRef.current?.setBuildTool(open ? { tool, rot } : null);
  }, [open, tool, rot, engineReady, engineRef]);

  // The undo offer runs out.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const place = async (): Promise<void> => {
    if (!aim || aim.problem || tool === 'remove' || pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await fetch('/api/town/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: tool, gx: aim.gx, gy: aim.gy, rot }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        build?: TownBuild;
        balance?: number | null;
        error?: string;
      };
      if (!r.ok || !d.build) {
        setError(
          d.error === 'insufficient_balance'
            ? 'Not enough Sugar Tokens'
            : d.error === 'occupied'
              ? PROBLEM_TEXT.taken
              : d.error === 'sibling_land'
                ? PROBLEM_TEXT.sibling
                : d.error === 'limit_reached'
                  ? 'Your town is full of builds!'
                  : 'That did not work. Try again.',
        );
        if (d.error === 'occupied') void refresh();
        return;
      }
      if (typeof d.balance === 'number') onBalance(d.balance);
      show([...buildsRef.current, d.build], [d.build.id]);
      channelRef.current?.announce();
      setUndo({ id: d.build.id, until: Date.now() + UNDO_SECS * 1000 });
      playBubble();
      hapticSuccess();
    } catch {
      setError('That did not work. Try again.');
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await fetch('/api/town/builds/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = (await r.json().catch(() => ({}))) as { balance?: number | null; error?: string };
      if (!r.ok) {
        setError(d.error === 'not_yours' ? 'Only the builder can remove this' : 'That did not work. Try again.');
        return;
      }
      if (typeof d.balance === 'number') onBalance(d.balance);
      show(buildsRef.current.filter((b) => b.id !== id));
      channelRef.current?.announce();
      if (undo?.id === id) setUndo(null);
      playTap();
      hapticTap();
    } catch {
      setError('That did not work. Try again.');
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  const info = tool === 'remove' ? null : findBuild(tool);
  const target = aim ? (list.find((b) => b.gx === aim.gx && b.gy === aim.gy) ?? null) : null;
  const mine = !!target && (isGuest || target.kid_id === kidId);
  const refund = target
    ? aimAt - Date.parse(target.created_at) <= UNDO_SECS * 1000
      ? findBuild(target.kind).cost
      : Math.floor(findBuild(target.kind).cost / 2)
    : 0;
  const cost = isGuest ? 0 : (info?.cost ?? 0);
  const short = info ? cost - props.balance : 0;

  // What the big button says and whether it works.
  let action: { label: string; ok: boolean };
  if (!aim) action = { label: 'Tap the ground', ok: false };
  else if (tool === 'remove') {
    if (!target) action = { label: PROBLEM_TEXT.empty, ok: false };
    else if (!mine) action = { label: 'Only the builder can remove this', ok: false };
    else action = { label: refund > 0 ? `Remove (+${refund} back)` : 'Remove', ok: true };
  } else if (aim.problem) action = { label: PROBLEM_TEXT[aim.problem], ok: false };
  else if (short > 0) action = { label: `Need ${short} more`, ok: false };
  else action = { label: `Build ${info!.label}`, ok: true };

  const shown = peek ? findBuild(peek) : info;

  return (
    <div
      className="fixed inset-x-0 z-40 mx-auto flex w-[min(100%-1rem,44rem)] flex-col gap-2 rounded-3xl bg-white/95 p-3 shadow-2xl"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      role="dialog"
      aria-label="Build"
      data-aim={aim ? `${aim.gx},${aim.gy}` : ''}
    >
      {shown ? (
        // The piece, turning in 3D: the same model the town places. Sits
        // above the tray's corner so the tray itself stays short.
        <div
          className="absolute bottom-full left-3 mb-2 flex flex-col items-center rounded-3xl bg-white/95 px-2 pb-1.5 pt-1 shadow-xl"
          data-preview={shown.kind}
        >
          <ModelTurntable
            subject={`build:${shown.kind}`}
            width={112}
            height={112}
            variant="hero"
            fallback={<span className="text-6xl">{shown.glyph}</span>}
            ariaLabel={`${shown.label}, turning in 3D`}
          />
          <span className="text-xs font-bold text-zinc-700">{shown.label}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Pieces">
        {BUILD_CATALOG.map((b) => {
          const on = tool === b.kind;
          return (
            <button
              key={b.kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setTool(b.kind);
                setRot(0);
                playTap();
              }}
              // Mouse hover previews; a touch "hover" is the tap that selects.
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setPeek(b.kind);
              }}
              onPointerLeave={() => setPeek(null)}
              onFocus={() => setPeek(b.kind)}
              onBlur={() => setPeek(null)}
              className={`flex shrink-0 flex-col items-center rounded-2xl px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                on ? 'bg-amber-200 ring-4 ring-amber-400' : 'bg-zinc-100'
              }`}
              style={{ minHeight: 'var(--min-tap-target)', minWidth: 64 }}
              aria-label={`${b.label}, ${b.cost} Sugar Tokens`}
            >
              <span className="text-2xl" aria-hidden>
                {b.glyph}
              </span>
              <span>{b.label}</span>
              <span className="flex items-center gap-0.5 text-amber-900">
                <SugarTokenIcon />
                <span className="font-mono tabular-nums">{b.cost}</span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={tool === 'remove'}
          onClick={() => {
            setTool('remove');
            playTap();
          }}
          className={`flex shrink-0 flex-col items-center justify-center rounded-2xl px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
            tool === 'remove' ? 'bg-rose-200 ring-4 ring-rose-400' : 'bg-zinc-100'
          }`}
          style={{ minHeight: 'var(--min-tap-target)', minWidth: 64 }}
          aria-label="Remove a piece"
        >
          <span className="text-2xl" aria-hidden>
            🧹
          </span>
          <span>Remove</span>
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-full bg-rose-100 px-4 py-1.5 text-center text-sm font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-zinc-200 text-xl font-bold text-zinc-700 active:scale-95"
          aria-label="Stop building"
        >
          ✕
        </button>
        {info?.turns ? (
          <button
            type="button"
            onClick={() => {
              setRot((r) => (r + 1) % 4);
              playTap();
            }}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky-200 text-2xl text-sky-900 active:scale-95"
            aria-label="Turn the piece"
          >
            ↻
          </button>
        ) : null}
        <button
          type="button"
          disabled={!action.ok || pending}
          onClick={() => {
            if (tool === 'remove') {
              if (target) void remove(target.id);
            } else void place();
          }}
          className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-base font-bold shadow-sm transition active:scale-95 ${
            action.ok
              ? tool === 'remove'
                ? 'bg-rose-500 text-white'
                : 'bg-emerald-500 text-white'
              : 'bg-zinc-200 text-zinc-600'
          }`}
        >
          {pending ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          ) : (
            <>
              <span aria-hidden>{action.ok ? '✓' : '✗'}</span>
              <span className="truncate">{action.label}</span>
              {action.ok && tool !== 'remove' && cost > 0 ? (
                <span className="flex items-center gap-0.5">
                  <SugarTokenIcon />
                  <span className="font-mono tabular-nums">{cost}</span>
                </span>
              ) : null}
            </>
          )}
        </button>
        {undo ? (
          <button
            type="button"
            onClick={() => void remove(undo.id)}
            disabled={pending}
            className="h-12 shrink-0 rounded-full bg-amber-100 px-4 text-sm font-bold text-amber-900 active:scale-95"
            aria-label="Undo the last piece, tokens back"
          >
            ↩ Undo
          </button>
        ) : null}
      </div>
    </div>
  );
}
