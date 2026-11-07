// One switch for every paid model call.
//
// Three modules each read OPENROUTER_API_KEY independently and each already
// degrade gracefully when it is missing — the feature quietly does nothing
// rather than erroring. That existing path is the useful part: a kill switch
// that reuses it needs no new failure handling anywhere.
//
// So AI_ENABLED=false makes the key look absent. Flip one environment variable
// in Vercel and every model call stops, immediately, without a deploy. That
// matters because the bill is the deployment owner's and the highest-volume
// path (the evidence engine, on every qualifying game round) is triggered by a
// child holding a tablet.
//
// This is the LAST line of defence, not the first. The tier system already
// stops a restricted family reaching any of this (see lib/auth/tier.ts, and
// the money-boundary guard in lib/evidence/engine.ts). This is what you reach
// for when something unexpected is spending and you want it to stop now.

/** The OpenRouter key, or null when AI is switched off or unconfigured.
 *
 *  Returning null rather than throwing is deliberate: every caller already
 *  handles a null key by returning `{ ok: false, reason }`, so the kill switch
 *  inherits three tested degrade paths instead of adding a fourth. */
export function aiKey(): string | null {
  if (process.env.AI_ENABLED === 'false') return null;
  return process.env.OPENROUTER_API_KEY ?? null;
}

/** Why a call could not be made. Distinguishes "switched off on purpose" from
 *  "never configured" so a log line answers the question it raises. */
export function aiUnavailableReason(): string {
  return process.env.AI_ENABLED === 'false'
    ? 'AI is switched off for this deployment (AI_ENABLED=false)'
    : 'OPENROUTER_API_KEY is not set';
}
