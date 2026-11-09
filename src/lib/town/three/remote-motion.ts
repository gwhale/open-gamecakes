// The timing half of live town presence, kept free of three.js so it can be
// tested: what a moving kid sends (createNetTicker) and where a peer should be
// drawn between the packets that arrive (createPeerMotion).
//
// Every position is city px, the map both clients solve identically.

import type { PosPacket } from '@/lib/realtime/town-channel';

/** One position send every 250 ms (4 Hz). Was 125 ms; halved 2026-11-07 so
 *  about twice as many kids fit under the Supabase Free plan's 100 Realtime
 *  messages a second. Peers are interpolated, so the motion stays smooth. */
export const NET_SEND_INTERVAL_MS = 250;
/** How far behind the newest packet a peer is drawn, so there is normally a
 *  packet on either side to interpolate between. Must exceed the send
 *  interval, with room for network jitter. */
export const REMOTE_RENDER_DELAY_MS = 320;
/** How long a peer keeps coasting after packets stop before it stands still.
 *  Must exceed the send interval, or a peer stutters between packets. */
export const REMOTE_EXTRAPOLATE_MAX_MS = 400;
/** Stillness before a rest packet goes out. One unchanged frame isn't a stop:
 *  a ride can hold position for a frame without having ended. */
const STILL_BEFORE_REST_MS = 150;
const MOVED_EPS_PX = 0.5;
const SNAPSHOTS_KEPT = 4;

export type NetSample = Omit<PosPacket, 'k'>;

export interface NetTicker {
  /** Call once a frame. Returns a packet when one is due, else null. */
  tick(nowMs: number, x: number, y: number): NetSample | null;
  /** Send the current spot on the next tick even if standing still. A kid who
   *  arrives later has otherwise never been told where a still peer is. */
  forceNext(): void;
}

export function createNetTicker(): NetTicker {
  let lastSentAt = -Infinity;
  let sentX = NaN;
  let sentY = NaN;
  let frameX = NaN;
  let frameY = NaN;
  let lastMovedAt = -Infinity;
  let heading = 0;
  let sentMoving = false;
  let force = true; // the first tick announces where we are

  return {
    tick(nowMs, x, y) {
      if (Math.hypot(x - frameX, y - frameY) > MOVED_EPS_PX) lastMovedAt = nowMs;
      frameX = x;
      frameY = y;

      const moving = nowMs - lastMovedAt < STILL_BEFORE_REST_MS;
      if (moving && nowMs - lastSentAt >= NET_SEND_INTERVAL_MS) {
        // Velocity is measured from what was sent, so this works the same for
        // walking, trains, ferries and every rental without asking which it is.
        const dtS = (nowMs - lastSentAt) / 1000;
        const vx = Number.isFinite(sentX) && Number.isFinite(dtS) ? (x - sentX) / dtS : 0;
        const vy = Number.isFinite(sentY) && Number.isFinite(dtS) ? (y - sentY) / dtS : 0;
        if (vx !== 0 || vy !== 0) heading = Math.atan2(vx, vy);
        lastSentAt = nowMs;
        sentX = x;
        sentY = y;
        sentMoving = true;
        force = false;
        return { cx: x, cy: y, vx, vy, r: heading, m: 1, t: nowMs };
      }
      if (!moving && (sentMoving || force)) {
        lastSentAt = nowMs;
        sentX = x;
        sentY = y;
        sentMoving = false;
        force = false;
        return { cx: x, cy: y, vx: 0, vy: 0, r: heading, m: 0, t: nowMs };
      }
      return null;
    },
    forceNext() {
      force = true;
    },
  };
}

export interface PeerPose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  moving: boolean;
}

export interface PeerMotion {
  push(packet: NetSample, nowMs: number): void;
  /** Null until the first packet. */
  sample(nowMs: number): PeerPose | null;
}

export function createPeerMotion(): PeerMotion {
  const snapshots: NetSample[] = [];
  // Sender clocks aren't ours. The smallest (arrival - sent) seen is the best
  // estimate of the offset, since that packet had the least network delay.
  let clockOffset = Infinity;

  return {
    push(packet, nowMs) {
      clockOffset = Math.min(clockOffset, nowMs - packet.t);
      const newest = snapshots[snapshots.length - 1];
      if (newest && packet.t <= newest.t) return; // late or repeated
      snapshots.push(packet);
      if (snapshots.length > SNAPSHOTS_KEPT) snapshots.shift();
    },
    sample(nowMs) {
      const newest = snapshots[snapshots.length - 1];
      if (!newest) return null;
      const renderAt = nowMs - clockOffset - REMOTE_RENDER_DELAY_MS;

      if (renderAt >= newest.t) {
        const past = renderAt - newest.t;
        if (newest.m === 1 && past <= REMOTE_EXTRAPOLATE_MAX_MS) {
          return {
            x: newest.cx + (newest.vx * past) / 1000,
            y: newest.cy + (newest.vy * past) / 1000,
            vx: newest.vx,
            vy: newest.vy,
            moving: true,
          };
        }
        return { x: newest.cx, y: newest.cy, vx: 0, vy: 0, moving: false };
      }

      for (let i = snapshots.length - 1; i > 0; i--) {
        const a = snapshots[i - 1];
        const b = snapshots[i];
        if (renderAt >= a.t) {
          const f = (renderAt - a.t) / (b.t - a.t);
          return {
            x: a.cx + (b.cx - a.cx) * f,
            y: a.cy + (b.cy - a.cy) * f,
            vx: b.vx,
            vy: b.vy,
            moving: b.m === 1,
          };
        }
      }
      const oldest = snapshots[0];
      return { x: oldest.cx, y: oldest.cy, vx: 0, vy: 0, moving: false };
    },
  };
}
