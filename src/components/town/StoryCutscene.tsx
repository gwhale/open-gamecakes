'use client';

// StoryCutscene — the caption band shown while a story cutscene plays.
//
// During a cutscene the engine takes over the camera and pans AWAY from Cakey,
// so his follow-bubble can't carry the narration. This dedicated bottom band
// shows the current beat (driven by the engine's onCutsceneBeat → host state)
// like a storybook title card, plus a Skip button. The engine owns timing; this
// is a pure render of whatever line the host hands it.
//
// It sits above the canvas at a high z and a light bottom scrim keeps the text
// readable over the bright town without hiding the cutscene.

interface StoryCutsceneProps {
  /** Story icon emoji (matches the alert/card). */
  icon: string;
  /** The current beat's text. */
  line: string;
  /** Cut the cutscene short and return to play. */
  onSkip: () => void;
}

export default function StoryCutscene({ icon, line, onSkip }: StoryCutsceneProps): React.ReactElement {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center">
      {/* Skip — top-right of the band, the one interactive control. */}
      <div className="pointer-events-auto mb-2 self-end pr-4">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full bg-black/45 px-5 py-3 text-sm font-bold text-white/90 backdrop-blur-sm transition hover:bg-black/60 active:scale-95"
          style={{ minHeight: 'var(--min-tap-target)' }}
          aria-label="Skip the story"
        >
          Skip ⏭
        </button>
      </div>

      {/* Caption band. */}
      <div className="w-full bg-gradient-to-t from-black/55 to-transparent px-4 pb-6 pt-10">
        <div
          role="status"
          aria-live="polite"
          className="animate-cakey-pop mx-auto flex max-w-md items-center gap-3 rounded-3xl border-2 border-white/70 bg-gradient-to-b from-amber-50 to-rose-50 px-5 py-3 shadow-xl shadow-rose-500/20 dark:border-white/10 dark:from-zinc-800 dark:to-zinc-900"
        >
          <span className="text-2xl" aria-hidden>
            {icon}
          </span>
          <span className="font-display text-sm font-bold leading-snug text-zinc-800 dark:text-zinc-100">
            {line}
          </span>
        </div>
      </div>
    </div>
  );
}
