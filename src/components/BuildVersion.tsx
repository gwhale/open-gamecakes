// Build-version chip. Server component that reads Vercel's auto-injected
// commit SHA + deployment env vars and renders a tiny "v: abc1234" pill.
//
// Why this exists: every iPad PWA cache problem this session ended with
// "is the deploy live or am I on a stale bundle?" Now there's a single
// place a parent can look to verify which commit they're seeing — match
// it against the GitHub Actions / Vercel deploys list to settle the
// question in three seconds instead of three minutes of cache-busting.
//
// Vercel exposes VERCEL_GIT_COMMIT_SHA at runtime in server components.
// In dev (no Vercel) we fall back to a "dev" label.

const VERCEL_HASH = process.env.VERCEL_GIT_COMMIT_SHA;
const VERCEL_REF  = process.env.VERCEL_GIT_COMMIT_REF;

export default function BuildVersion({
  className = '',
  showBranch = false,
}: {
  className?: string;
  /** When true, also render the branch name (rare — most kids see only
   *  the master deploy). Useful on preview deploys. */
  showBranch?: boolean;
}) {
  const sha = VERCEL_HASH ? VERCEL_HASH.slice(0, 7) : 'dev';
  const branch = VERCEL_REF ?? '';
  const isMaster = !branch || branch === 'master' || branch === 'main';

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] text-zinc-400 ${className}`}
      title={
        VERCEL_HASH
          ? `Deployed commit: ${VERCEL_HASH}${branch ? ` (${branch})` : ''}`
          : 'Local dev build'
      }
    >
      <span aria-hidden>·</span>
      v: {sha}
      {showBranch && !isMaster ? (
        <span className="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {branch}
        </span>
      ) : null}
    </span>
  );
}
