'use client';

// ChestGate — the three-questions dialog that opens a treasure chest.
//
// It owns the conversation with /api/deep/chest and nothing else. In
// particular it does NOT decide whether an answer was right: it forwards what
// the kid entered and renders what the server says came back. ChallengeInput
// still marks locally for the instant flash of feedback, because waiting on a
// round trip to colour a keypad would feel broken — but that verdict is
// cosmetic, and the count on screen is always the server's.
//
// NO FAILURE STATE. There is no lives counter, no timer and no way to get it
// wrong enough to lose the chest. A wrong answer just brings another question.
// The progress dots therefore only ever fill, never empty, which is the whole
// design rendered as three small circles.
//
// Designed for a kid on an iPad: big type, no hover states, and the dialog is
// dismissible, because a kid who wants to swim away mid-question is allowed to.
// Nothing is lost by leaving — the answers already given are gone, but so is
// any penalty, and the chest is exactly where they left it.

import { useCallback, useEffect, useRef, useState } from 'react';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { playTap, playStart, playLevelUp } from '@/lib/games/shared/sounds';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import type { Challenge } from '@/lib/games/shared/challenge';

export interface GrantedItem {
  slug: string;
  name: string;
  emoji: string;
  note: string;
}

interface GateResponse {
  open: boolean;
  alreadyOpen?: boolean;
  asked?: number;
  correct?: number;
  needed?: number;
  lastCorrect?: boolean | null;
  challenge?: Challenge;
  skill?: { name: string; reason: string };
  item?: GrantedItem | null;
  error?: string;
}

export default function ChestGate({
  chestSlug,
  onOpened,
  onClose,
}: {
  chestSlug: string;
  /** The chest opened — swing the lid and tell Cakey. */
  onOpened: (item: GrantedItem | null) => void;
  onClose: () => void;
}): React.ReactElement {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [skill, setSkill] = useState<{ name: string; reason: string } | null>(null);
  const [correct, setCorrect] = useState(0);
  const [needed, setNeeded] = useState(3);
  const [pending, setPending] = useState(true);
  const [wrong, setWrong] = useState(false);
  const [failed, setFailed] = useState(false);
  const [granted, setGranted] = useState<GrantedItem | null | undefined>(undefined);

  // Every answer this run, in order. The server re-marks the whole list each
  // time, so this IS the run — there is no session to lose.
  const answers = useRef<string[]>([]);
  const closedRef = useRef(false);

  useEscapeKey(onClose);

  const post = useCallback(
    async (given: string | null) => {
      if (closedRef.current) return;
      if (given !== null) answers.current = [...answers.current, given];
      setPending(true);
      try {
        const res = await fetch('/api/deep/chest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chest_slug: chestSlug, answers: answers.current }),
        });
        const data = (await res.json()) as GateResponse;
        if (closedRef.current) return;

        if (!res.ok) {
          setFailed(true);
          return;
        }

        setWrong(data.lastCorrect === false);
        if (typeof data.correct === 'number') setCorrect(data.correct);
        if (typeof data.needed === 'number') setNeeded(data.needed);
        if (data.skill) setSkill(data.skill);

        if (data.open) {
          setChallenge(null);
          setGranted(data.item ?? null);
          playLevelUp();
          hapticSuccess();
          onOpened(data.item ?? null);
          return;
        }
        setChallenge(data.challenge ?? null);
      } catch {
        if (!closedRef.current) setFailed(true);
      } finally {
        if (!closedRef.current) setPending(false);
      }
    },
    [chestSlug, onOpened],
  );

  // Open the conversation. An empty answer list asks for question one.
  useEffect(() => {
    playStart();
    void post(null);
    return () => {
      closedRef.current = true;
    };
    // Mount once: the chest does not change under an open dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswer = useCallback(
    (wasRight: boolean, given?: string) => {
      playTap();
      hapticTap();
      // `given` is the raw entry. A challenge kind that cannot report one has no
      // business being in a gate, and the server rejects an empty answer anyway.
      void post(given ?? '');
    },
    [post],
  );

  const done = granted !== undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={done ? 'You found something' : 'Three questions to open the chest'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-gradient-to-b from-white to-sky-50 p-6 text-center shadow-2xl">
        {done ? (
          <>
            <div className="text-6xl" aria-hidden>
              {granted?.emoji ?? '🎁'}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-sky-600">
                You found
              </div>
              <h2 className="text-2xl font-bold text-zinc-900">{granted?.name ?? 'Something'}</h2>
              {granted?.note ? (
                <p className="mt-2 text-sm text-zinc-600">{granted.note}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-full bg-sky-500 px-8 py-3 text-lg font-bold text-white shadow-lg"
            >
              Keep exploring
            </button>
          </>
        ) : failed ? (
          <>
            <div className="text-5xl" aria-hidden>
              🫧
            </div>
            <p className="text-base text-zinc-700">
              The chest is stuck. Try it again in a moment.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-sky-500 px-8 py-3 text-lg font-bold text-white shadow-lg"
            >
              Okay
            </button>
          </>
        ) : (
          <>
            <div className="flex w-full items-center justify-between">
              <div className="text-left">
                <div className="text-xs font-bold uppercase tracking-wider text-sky-600">
                  Locked chest
                </div>
                {skill ? (
                  <div className="text-sm font-semibold text-zinc-700">{skill.name}</div>
                ) : null}
              </div>
              {/* Progress that only ever fills. Three dots, no lives. */}
              <div className="flex gap-1.5" aria-label={`${correct} of ${needed} correct`}>
                {Array.from({ length: needed }, (_, i) => (
                  <span
                    key={i}
                    className={
                      'h-4 w-4 rounded-full ' + (i < correct ? 'bg-emerald-400' : 'bg-zinc-200')
                    }
                  />
                ))}
              </div>
            </div>

            {wrong ? (
              <p className="text-sm font-semibold text-amber-600">
                Not that one — here is another.
              </p>
            ) : null}

            {challenge ? (
              // Full width: the keypad is a 3-column grid and the card centres its
              // children, which squeezed the last column and clipped the Go key.
              <div className="w-full">
                <ChallengeInput challenge={challenge} onAnswer={handleAnswer} flashWrong={wrong} />
              </div>
            ) : (
              <p className="py-8 text-base text-zinc-500">
                {pending ? 'Opening…' : 'Just a moment…'}
              </p>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-zinc-400 underline"
            >
              Swim away
            </button>
          </>
        )}
      </div>
    </div>
  );
}
