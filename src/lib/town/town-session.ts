// Tab-scoped town state that has to survive a round trip through a game.
//
// Walking into a booth navigates away from /town and back, which REMOUNTS the
// whole host — so anything the host held in React state is gone when the kid
// returns. Two things kids noticed missing (bug tickets, 2026-07-25):
//   * "My skateboard disappeared after I played a game."  → the mounted ride
//   * "it returned me to the main island instead of chess island" → the spot
//
// sessionStorage is the right shelf for this, not the DB:
//   * it's per-tab and dies with the tab, so a fresh visit still starts clean —
//     which is exactly the Guest sandbox's "nothing is saved" contract (same
//     reasoning as lib/tokens/guest-wallet.ts, which stores guest coins here);
//   * a mounted vehicle is session-shaped anyway — no kid expects to still be
//     on the skateboard tomorrow, but everyone expects it after one game.
//
// Real kids read `pos` from the server (kid_avatar_position) and only use the
// `ride` slot here. Guests have no server row at all, so they read everything.
// Every accessor is safe on the server and when storage is blocked (private
// mode / iframe): reads return null, writes are dropped.

import { isVehicleKind, type VehicleKind } from '@/lib/town/vehicles';

const KEY = 'gc_town_session';

export interface TownSessionState {
  /** Last known spot, in the same original-region space as the position API. */
  pos?: { region_slug: string; x: number; y: number };
  /** The ride the kid was mounted on when they left the town page. */
  ride?: VehicleKind;
  /** Rides the kid holds — guests only (real rentals live in the DB). */
  rentals?: VehicleKind[];
  /** Regions revealed this session — guests only. Must travel with `pos`: the
   *  guest's discover/ferry POSTs are short-circuited server-side, so without
   *  this a restored spot on Chess Isle would drop them inside a still-fogged
   *  land with the walk-block up. */
  discovered?: string[];
  /** Milliseconds of actual town PLAY since the last candy storm ended.
   *
   *  Lives here rather than in the engine because the engine's weather clock is
   *  per-mount: every trip into a game unmounts the town and would reset it. A
   *  storm gap measured in hours has to survive those trips or it never elapses.
   *  Tab-scoped like everything else in this store — a fresh tab starts a fresh
   *  weather story, which is fine for something this cosmetic. */
  sinceStorm?: number;
}

function read(): TownSessionState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TownSessionState;
  } catch {
    return {};
  }
}

function write(next: TownSessionState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked — the town just forgets across navigations, as before
  }
}

/** Merge a partial update into the stored state. */
function patch(fields: TownSessionState): void {
  write({ ...read(), ...fields });
}

/** Last saved spot, or null if none/malformed. Validated on the way out so a
 *  hand-edited key can't push a bogus region slug into the engine's spawn. */
export function getTownSessionPos(): { region_slug: string; x: number; y: number } | null {
  const p = read().pos;
  if (!p || typeof p.region_slug !== 'string' || !p.region_slug) return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { region_slug: p.region_slug, x: p.x, y: p.y };
}

export function setTownSessionPos(pos: { region_slug: string; x: number; y: number }): void {
  patch({ pos });
}

/** The ride to re-mount on the next town boot, or null. */
export function getTownSessionRide(): VehicleKind | null {
  const ride = read().ride;
  return isVehicleKind(ride) ? ride : null;
}

/** Remember (or forget, with null) the mounted ride. */
export function setTownSessionRide(ride: VehicleKind | null): void {
  const next = read();
  if (ride) next.ride = ride;
  else delete next.ride;
  write(next);
}

/** Guest-only held rentals. Empty array when unset. */
export function getTownSessionRentals(): VehicleKind[] {
  const list = read().rentals;
  return Array.isArray(list) ? list.filter(isVehicleKind) : [];
}

export function setTownSessionRentals(rentals: readonly VehicleKind[]): void {
  patch({ rentals: [...rentals] });
}

/** Guest-only revealed regions. Empty array when unset. */
/** Play-ms since the last storm ended (see TownSessionState.sinceStorm). */
export function getTownSessionSinceStorm(): number {
  return read().sinceStorm ?? 0;
}

export function setTownSessionSinceStorm(ms: number): void {
  write({ ...read(), sinceStorm: Math.max(0, Math.round(ms)) });
}

export function getTownSessionDiscovered(): string[] {
  const list = read().discovered;
  return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.length > 0) : [];
}

export function setTownSessionDiscovered(slugs: readonly string[]): void {
  patch({ discovered: [...slugs] });
}
