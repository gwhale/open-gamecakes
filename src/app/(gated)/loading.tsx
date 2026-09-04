// Suspense fallback for the gated layout — shown briefly during
// server-component renders + route transitions. Without this, a kid
// tapping between /town and /games/foo sees a blank gray flash. With
// it, they see Cakey baking the next thing.
//
// Stays inside the gated layout so the parent kid-picker / parent
// dashboard / town / games all share this fallback. The login + public
// routes outside (gated) have their own fast loads and don't need it.

export default function GatedLoading(): React.ReactElement {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50">
      <div className="flex flex-col items-center gap-4">
        <span
          className="text-7xl"
          style={{
            animation: 'cakey-spin 1.2s cubic-bezier(0.4, 0.0, 0.2, 1) infinite',
            display: 'inline-block',
          }}
          aria-hidden
        >
          🎂
        </span>
        <span className="font-display text-lg font-medium text-zinc-600">
          Cakey&apos;s baking…
        </span>
      </div>
      <style>{`
        @keyframes cakey-spin {
          0%   { transform: rotate(-12deg) scale(1);    }
          50%  { transform: rotate(12deg)  scale(1.08); }
          100% { transform: rotate(-12deg) scale(1);    }
        }
      `}</style>
    </main>
  );
}
