'use client';

// FeedbackModal — the STORY OVEN: a kid pops an idea/bug/wish in to be baked
// into a real change (voice or text). Kid-facing copy is the oven metaphor; the
// data plumbing (/api/feedback, the `feedback` table, ticket_type enum) is
// unchanged.
//
// Flow (NO AI rewrite — that step was brittle and broke submissions):
//   1. (Optional) Pick-game phase — shown when gameSlug was NOT prefilled
//      (e.g. opened from the global FAB on /map or /tickets).
//   2. Input phase: kid types text, OR records voice which is transcribed
//      straight into the same textarea (voice-to-text). They can edit it.
//   3. Kid picks a "recipe" type (bug / idea / feedback) and pops it in the oven.
//   4. POST directly to /api/feedback → saved → "it's in the oven" state → close.
//
// MediaRecorder API for audio (iPad Safari uses audio/mp4). Falls back to
// text-only if the microphone is unavailable or transcription fails.

import { useCallback, useRef, useState } from 'react';
import { GAME_REGISTRY, findGame } from '@/lib/games/registry';
import GamecakesMascot from '@/components/GamecakesMascot';

type Phase = 'pick-game' | 'input' | 'processing' | 'sent' | 'error';
type TicketType = 'bug' | 'feature' | 'feedback';

// The three "recipes" a kid can bake. Labels are the oven metaphor; the `value`
// strings are the unchanged ticket_type enum the API + DB expect.
const TYPE_OPTIONS: { value: TicketType; emoji: string; label: string }[] = [
  { value: 'bug', emoji: '🐛', label: 'Squash a bug' },
  { value: 'feature', emoji: '✨', label: 'New idea' },
  { value: 'feedback', emoji: '💬', label: 'A thought' },
];

/** Build a short ticket title from the kid's own words (no AI). */
function deriveTitle(text: string): string {
  const base = (text.split('\n')[0].trim() || text.trim()).replace(/\s+/g, ' ');
  return base.length <= 60 ? base : `${base.slice(0, 57).trimEnd()}…`;
}

export default function FeedbackModal({
  gameSlug,
  kidName,
  onClose,
}: {
  /** Prefilled game slug. If omitted, the modal opens on a picker step. */
  gameSlug?: string;
  kidName?: string;
  onClose: () => void;
}) {
  // Initial phase: go straight to input if we know the game already,
  // otherwise let the kid pick one first.
  const [phase, setPhase] = useState<Phase>(gameSlug ? 'input' : 'pick-game');
  // Track which game the ticket is being filed against. null = "General".
  const [selectedGameSlug, setSelectedGameSlug] = useState<string | null>(
    gameSlug ?? null,
  );
  const [recording, setRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('feedback');
  const [errorMsg, setErrorMsg] = useState('');
  const [micSupported, setMicSupported] = useState(true);
  const [processingMsg, setProcessingMsg] = useState('Sliding it into the oven…');

  // Whether a picker was shown — drives the "← Change game" affordance in
  // the input phase so kids can go back and pick a different one.
  const pickerWasShown = !gameSlug;
  const selectedGame = selectedGameSlug ? findGame(selectedGameSlug) : null;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Path of an uploaded voice note, attached to the ticket on send so a
  // grown-up can listen to the original audio.
  const audioPathRef = useRef<string | null>(null);

  // ---- Voice recording → transcribe into the textarea ----
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setErrorMsg('');
      setRecording(true);
    } catch {
      // Microphone not available — fall back to text
      setMicSupported(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      // Stop all tracks so the mic indicator goes away
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setRecording(false);

      setProcessingMsg('Turning your voice into words…');
      setPhase('processing');
      const fd = new FormData();
      fd.append('audio', blob, `feedback.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
      if (selectedGameSlug) fd.append('gameSlug', selectedGameSlug);
      if (kidName) fd.append('kidName', kidName);

      try {
        const res = await fetch('/api/feedback/transcribe', { method: 'POST', body: fd });
        const data = await res.json();

        if (data.ok && typeof data.transcript === 'string') {
          if (data.audioPath) audioPathRef.current = data.audioPath;
          // Drop the transcribed words into the textarea (append if the kid
          // already typed something) so they can review/edit before sending.
          setTextInput((prev) => (prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript));
          setPhase('input');
        } else {
          // Transcription didn't work — let them type instead.
          setPhase('input');
          setErrorMsg('Voice didn’t come through — try typing it!');
        }
      } catch {
        setPhase('input');
        setErrorMsg('Voice didn’t come through — try typing it!');
      }
    };

    recorder.stop();
  }, [selectedGameSlug, kidName]);

  // ---- Send the feedback straight to the table (no AI step) ----
  const handleSend = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;
    setProcessingMsg('Sliding it into the oven…');
    setPhase('processing');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSlug: selectedGameSlug,
          transcript: text,
          audioPath: audioPathRef.current,
          ticketType,
          title: deriveTitle(text),
          summary: text,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setPhase('sent');
      } else {
        setErrorMsg(data.error || 'Failed to save');
        setPhase('error');
      }
    } catch (err) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  }, [textInput, ticketType, selectedGameSlug]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The Story Oven"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      {/* The card is BOUNDED to the viewport. Unbounded, a centred flex child
          that outgrows its container overflows in BOTH directions and neither
          end can be reached — which is how the 22-game picker below clipped the
          top of the list and pushed the send button off an iPad's bottom edge at
          the same time (two separate kid tickets, one cause). The picker pins
          its own footer and scrolls just the grid; `overflow-y-auto` here is the
          backstop so any other phase scrolls instead of losing its buttons. */}
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        {/* ---- PICK-GAME phase (global launcher entry point) ---- */}
        {phase === 'pick-game' ? (
          <>
            <div className="flex shrink-0 flex-col items-center text-center">
              <GamecakesMascot mood="wave" size={80} />
              <h2 className="mt-1 text-xl font-bold">Welcome to the Story Oven!</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                What are we baking today? Pick a game.
              </p>
            </div>

            {/* Every game in the registry, scrollable. `min-h-0` is load-bearing:
                a flex child defaults to min-height:auto, which refuses to shrink
                below its content and would push the buttons below back off the
                screen no matter what the parent's max-height says. */}
            <div className="mt-5 grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {GAME_REGISTRY.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => {
                    setSelectedGameSlug(g.slug);
                    setPhase('input');
                  }}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-zinc-50 px-3 py-4 shadow-sm transition-all hover:bg-white hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  <span className="text-3xl" aria-hidden>{g.glyph}</span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {g.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedGameSlug(null);
                setPhase('input');
              }}
              className="mt-3 w-full shrink-0 rounded-full border border-dashed border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 active:scale-95 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              🍰 Something else
            </button>

            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full shrink-0 rounded-full px-4 py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
          </>
        ) : null}

        {/* ---- INPUT phase ---- */}
        {phase === 'input' ? (
          <>
            <div className="flex flex-col items-center text-center">
              <GamecakesMascot mood="happy" size={72} />
              <h2 className="mt-1 text-xl font-bold">
                {selectedGame ? `What should we bake for ${selectedGame.label}?` : 'What should we bake?'}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                A fix, a fresh idea, even a whole new game — pop it in and we&rsquo;ll bake it.
              </p>
            </div>

            {/* Selected-game chip with a "change" affordance — only when the
                kid went through the picker (i.e. no gameSlug was prefilled). */}
            {pickerWasShown ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <span aria-hidden>{selectedGame?.glyph ?? '💬'}</span>
                  <span>{selectedGame?.label ?? 'General'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPhase('pick-game')}
                  className="text-xs font-medium text-sky-700 underline hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
                >
                  Change
                </button>
              </div>
            ) : null}

            {errorMsg ? (
              <p className="mt-3 text-center text-sm text-amber-600">{errorMsg}</p>
            ) : null}

            {/* Voice recording → fills the textarea below */}
            {micSupported ? (
              <div className="mt-5 flex flex-col items-center gap-3">
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-3xl text-white shadow-lg hover:bg-red-600 active:scale-95"
                  >
                    🎙️
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-xl font-bold text-white shadow-lg animate-pulse"
                  >
                    ⏹ Stop
                  </button>
                )}
                <p className="text-xs text-zinc-500">
                  {recording ? 'Recording… tap Stop to turn it into a recipe' : 'Tap to talk — I’ll write down your recipe'}
                </p>
              </div>
            ) : null}

            {/* Divider */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
              <span className="text-xs text-zinc-400">{micSupported ? 'or type it' : 'type it'}</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            </div>

            {/* Text input (voice transcription lands here too) */}
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="The fish are too fast... I wish there was a dinosaur game..."
              rows={3}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />

            {/* Type picker (manual — no AI classification) */}
            <div className="mt-3 flex gap-2" role="group" aria-label="Feedback type">
              {TYPE_OPTIONS.map((opt) => {
                const active = ticketType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTicketType(opt.value)}
                    aria-pressed={active}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-full border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200'
                        : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span aria-hidden>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSend}
                disabled={!textInput.trim()}
                className="flex-1 rounded-full bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                🔥 Into the oven!
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {/* ---- PROCESSING phase ---- */}
        {phase === 'processing' ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-4xl animate-spin">⚙️</div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {processingMsg}
            </p>
          </div>
        ) : null}

        {/* ---- SENT phase ---- */}
        {phase === 'sent' ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <GamecakesMascot mood="celebrate" size={96} />
            <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              It&rsquo;s in the oven! 🔥
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Your idea is <span className="font-semibold">🥣 in the mixing bowl</span>.
              A grown-up baker will check on it soon.
            </p>
            <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <a
                href="/tickets"
                className="rounded-full bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700 active:scale-95"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                🧁 See what&rsquo;s baking
              </a>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                {gameSlug ? 'Back to game' : 'Close'}
              </button>
            </div>
          </div>
        ) : null}

        {/* ---- ERROR phase ---- */}
        {phase === 'error' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="text-4xl">😕</div>
            <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
            <button
              type="button"
              onClick={() => { setPhase('input'); setErrorMsg(''); }}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
