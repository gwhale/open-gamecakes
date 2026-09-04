// Weather tuning for the 3D town — the ambient director's timing, the storm
// mechanic's costs, and particle budgets. Kept dependency-free (no `three`, no
// React) so both the engine and the UI can import the constants + the shared
// WeatherKind type.

/** The six sky states. `rainbow` is never picked at random — it's scripted
 *  after a shower or a storm, then the sky returns to `sunny`. */
export type WeatherKind = 'sunny' | 'overcast' | 'shower' | 'snow' | 'storm' | 'rainbow';

// ---- Ambient director ----
/** How long each state holds before the director picks again. Long dwells are
 *  the point — weather is an occasional gift, not a strobe. */
export const WEATHER_DWELL_MIN_MS = 90_000;
export const WEATHER_DWELL_MAX_MS = 180_000;
/** Crossfade duration for sky/fog/light between states. */
export const WEATHER_TRANSITION_MS = 2_500;
/** Precipitation count ramps in/out over this long so it never pops on. */
export const PRECIP_RAMP_MS = 1_500;
/** Weighted random weights for the ambient pick (rainbow is scripted, so it's
 *  excluded here). A storm only actually fires if it's off cooldown AND a
 *  discovered game land is available to target. */
export const WEATHER_WEIGHTS: Record<Exclude<WeatherKind, 'rainbow'>, number> = {
  sunny: 45,
  overcast: 20,
  shower: 15,
  snow: 10,
  storm: 7,
};
/** "Busy" states (visually active) — the director never runs two back-to-back. */
export const BUSY_WEATHER: ReadonlyArray<WeatherKind> = ['shower', 'snow', 'storm'];

// ---- Storm mechanic ----
/** How long a storm sits on a land before it blows over on its own (free). */
export const STORM_DURATION_MS = 180_000;
/** Minimum gap between storms, measured in PLAYING TIME — one storm per hour of
 *  actual play.
 *
 *  Was 6 minutes, which made a candy storm a routine interruption rather than an
 *  event. An unlock is meant to be permanent; a storm is the single exception
 *  that takes a land (and the games on it) back for a while, so it should feel
 *  like weather, not a tax.
 *
 *  ⚠️ This is counted against playing time that PERSISTS across town remounts
 *  (see sinceStorm in town-session.ts). The engine's weather clock is per-mount
 *  and resets every time a kid walks into a game and back, so counting an hour
 *  on that clock alone would mean storms essentially never fire. */
export const STORM_MIN_GAP_MS = 60 * 60_000;
/** Sugar Tokens to blow the fog away early (or wait it out free). "A few." */
import { STORM_CLEAR } from '@/lib/tokens/economy';

export const STORM_CLEAR_COST = STORM_CLEAR;
/** Approach distance (world px) at which the "blow away the storm?" prompt fires
 *  — mirrors the fog-approach affordance. */
export const STORM_APPROACH_PX = 90;

// ---- Particle budget (tablet-safe) ----
export const PRECIP_CAP_TABLET = 120;
export const PRECIP_CAP_DESKTOP = 200;
