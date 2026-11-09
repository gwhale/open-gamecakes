// Checks on what arrives from the town channel, before it reaches the scene.
//
// The channel is public to anyone holding the family's token, and every field
// is written by another browser. This catches malformed data. It doesn't prove
// who sent it: `k` and `kid_id` are self-reported until groups move to private
// channels with server-verified identity.

import { coerceCupcakeConfig } from '@/lib/cupcake/config';
import type { PosPacket, TownPresence } from './town-channel';

const ID_MAX = 64;
const NAME_MAX = 40;
const SLUG_MAX = 64;
/** Far beyond any real map coordinate or ride speed. */
const COORD_MAX = 1_000_000;
const SPEED_MAX = 100_000;

const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

const within = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** A peer's presence, or null if malformed. `key` is the channel's presence
 *  key, which the payload's kid_id must match. */
export function parsePresence(key: string, raw: unknown): TownPresence | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.kid_id !== key || !isText(p.kid_id, ID_MAX)) return null;
  if (!isText(p.name, NAME_MAX) || !isText(p.region_slug, SLUG_MAX)) return null;
  return {
    kid_id: p.kid_id,
    name: p.name,
    region_slug: p.region_slug,
    cupcake: coerceCupcakeConfig(p.cupcake),
  };
}

/** A position packet, or null if malformed. */
export function parsePos(raw: unknown): PosPacket | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!isText(p.k, ID_MAX)) return null;
  if (!within(p.cx, COORD_MAX) || !within(p.cy, COORD_MAX)) return null;
  if (!within(p.vx, SPEED_MAX) || !within(p.vy, SPEED_MAX)) return null;
  if (!within(p.r, Math.PI * 2) || !within(p.t, Number.MAX_SAFE_INTEGER)) return null;
  if (p.m !== 0 && p.m !== 1) return null;
  return { k: p.k, cx: p.cx, cy: p.cy, vx: p.vx, vy: p.vy, r: p.r, m: p.m, t: p.t };
}
