// Town presence channel — the client-only wrapper that owns the multiplayer
// WIRE CONTRACT for Gamecakes City.
//
// Everything about "what messages exist and what shape they are" lives here so
// that the React host (ThreeTownHost) and the scene layer (remote-avatars, a
// PR 2 concern) never hand-roll a `channel.send(...)` payload. If the contract
// changes, it changes in exactly one file.
//
// Transport: Supabase Realtime. The browser opens a WebSocket straight to
// Supabase, so Vercel's serverless model is irrelevant — no API route sits in
// the hot path. Two Realtime primitives are used:
//   - PRESENCE  → who is in the town right now (join/leave + a small profile
//                 payload per peer). Supabase gives us heartbeat + timeout for
//                 free, so a hard-closed iPad tab despawns on its own.
//   - BROADCAST → ephemeral, high-frequency messages (position @ 8 Hz, emotes).
//                 Never touches the database; a dropped packet just means a
//                 briefly-stale peer, never a broken state.
//
// Same-family scoping is enforced by the channel NAME (`town:{topicToken}`),
// derived server-side in src/lib/realtime/topic.ts. This module receives the
// already-hashed token — it never sees a family_id.
//
// NOTE (Phase A / PR 1): this wrapper is complete, but the only consumer in
// PR 1 is a smoke-test join in ThreeTownHost behind `?mp=1`. Position emitting
// (engine onNetTick) and remote-avatar rendering land in PR 2; emotes +
// tap-to-greet in PR 3. The contract below is the target shape those PRs build
// against.

'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { CupcakeConfig } from '@/lib/cupcake/config';

// ---------------------------------------------------------------------------
// Wire contract
// ---------------------------------------------------------------------------

/** Per-peer presence profile — the "who's here" payload. Tracked once on join
 *  and re-tracked when the kid crosses into a new region (so the roster pill
 *  and initial placement stay correct). Kept small: it rides every presence
 *  sync, not just joins. */
export interface TownPresence {
  kid_id: string;
  name: string;
  cupcake: CupcakeConfig;
  region_slug: string;
}

/** Position broadcast — sent at ~8 Hz while the avatar is moving, plus a
 *  single "rest packet" the moment it stops (so peers settle on the exact
 *  final spot + facing instead of dead-reckoning past it).
 *
 *  Coordinates are CITY-PIXEL space (the deterministic layout both clients
 *  agree on), NOT the lossy origin-space the /api/town/position route uses.
 *
 *  Field names are single-letter on purpose — this is the one message that
 *  goes out 8×/second per moving kid, so bytes matter. */
export interface PosPacket {
  /** sender kid_id (used to drop self-echo from a same-kid second device) */
  k: string;
  /** city-px x */
  cx: number;
  /** city-px y */
  cy: number;
  /** velocity x (city-px/s) — drives extrapolation when snapshots starve, and
   *  facing while moving */
  vx: number;
  /** velocity y (city-px/s) */
  vy: number;
  /** facing heading in radians — authoritative on the rest packet, when
   *  velocity is ~0 and can no longer imply which way the cupcake looks */
  r: number;
  /** moving flag (1 = walking/riding, 0 = at rest) — feeds avatar.update()'s
   *  bob/step animation on the remote peer */
  m: 0 | 1;
  /** sender clock (ms). Interpolation orders snapshots by this, not by arrival
   *  order, so out-of-order UDP-ish delivery can't jitter the peer. */
  t: number;
}

export type EmoteKind = 'wave' | 'heart' | 'party';

/** Emote broadcast — a floating 👋 / ❤️ / 🎉 over the sender's cupcake.
 *  `to` is set when the emote is a targeted greeting (tap-to-greet, PR 3) so
 *  the recipient can react specially ("<kid> waved at you!"). */
export interface EmotePacket {
  k: string;
  e: EmoteKind;
  to?: string;
}

// Broadcast event names — kept as consts so a typo can't silently create a
// second, never-received channel of messages.
const EV_POS = 'pos';
const EV_EMOTE = 'emote';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JoinTownChannelArgs {
  /** The `town:{topicToken}` token derived server-side. */
  topicToken: string;
  /** This client's own presence profile. Its `kid_id` is the presence key and
   *  the self-echo filter. */
  self: TownPresence;
  /** Fired on every presence change with the full peer list (self excluded). */
  onPeers?: (peers: TownPresence[]) => void;
  /** Fired for each remote position packet (self-echo already filtered). */
  onPos?: (pos: PosPacket) => void;
  /** Fired for each remote emote (self-echo already filtered). */
  onEmote?: (emote: EmotePacket) => void;
  /** Lifecycle signal — 'joined' once presence is tracked, 'error'/'closed'
   *  on trouble. Handy for a "connecting…" indicator and for logging. */
  onStatus?: (status: 'joined' | 'error' | 'closed') => void;
}

export interface TownChannelHandle {
  /** Broadcast our position. Caller supplies everything but `k` (we stamp it).
   *  Throttling to 8 Hz is the caller's job (the engine's net tick). */
  sendPos: (pos: Omit<PosPacket, 'k'>) => void;
  /** Broadcast an emote from us, optionally targeted at a peer. */
  sendEmote: (kind: EmoteKind, to?: string) => void;
  /** Update our presence profile (e.g. new region_slug after crossing a
   *  border, or a fresh cupcake after visiting the store mid-session). */
  retrack: (next: Partial<Pick<TownPresence, 'region_slug' | 'cupcake' | 'name'>>) => void;
  /** Untrack + tear down the channel. Idempotent. */
  leave: () => Promise<void>;
}

/**
 * Join the family's town presence channel.
 *
 * Returns a handle immediately; presence is tracked asynchronously once the
 * subscription is live (watch `onStatus('joined')`). Sends issued before the
 * channel is subscribed are simply dropped by Supabase — acceptable for an
 * 8 Hz position stream where the next tick retries in 125 ms.
 */
export function joinTownChannel(args: JoinTownChannelArgs): TownChannelHandle {
  const { topicToken, self, onPeers, onPos, onEmote, onStatus } = args;
  const sb = supabaseBrowser();

  // Mutable copy of our presence so `retrack()` can patch fields.
  let presence: TownPresence = { ...self };

  const channel: RealtimeChannel = sb.channel(`town:${topicToken}`, {
    config: {
      // self:false → Supabase won't echo our own broadcasts back to us.
      // ack:false  → fire-and-forget; we don't await server receipt (this is
      //              an 8 Hz stream, not a transaction).
      broadcast: { self: false, ack: false },
      // Key presence by kid_id. Consequence: the SAME kid on TWO devices shares
      // one presence slot (second track replaces first). That's fine for the
      // roster, and the k===self.kid_id guards below stop a device from
      // rendering its own other-tab as a ghost peer.
      presence: { key: self.kid_id },
    },
  });

  // ---- Presence: build the peer roster (self excluded) ----
  const emitPeers = (): void => {
    if (!onPeers) return;
    const state = channel.presenceState<TownPresence>();
    const peers: TownPresence[] = [];
    for (const key of Object.keys(state)) {
      if (key === self.kid_id) continue; // never list ourselves
      // presenceState() gives an array of metas per key; take the latest.
      const metas = state[key];
      const latest = metas[metas.length - 1];
      if (latest) peers.push(latest);
    }
    onPeers(peers);
  };
  channel.on('presence', { event: 'sync' }, emitPeers);
  channel.on('presence', { event: 'join' }, emitPeers);
  channel.on('presence', { event: 'leave' }, emitPeers);

  // ---- Broadcast: position + emotes (drop self-echo from a 2nd same-kid device) ----
  channel.on('broadcast', { event: EV_POS }, ({ payload }) => {
    const pos = payload as PosPacket;
    if (pos.k === self.kid_id) return;
    onPos?.(pos);
  });
  channel.on('broadcast', { event: EV_EMOTE }, ({ payload }) => {
    const emote = payload as EmotePacket;
    if (emote.k === self.kid_id) return;
    onEmote?.(emote);
  });

  // ---- Subscribe, then track our own presence ----
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.track(presence);
      onStatus?.('joined');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      onStatus?.('error');
    } else if (status === 'CLOSED') {
      onStatus?.('closed');
    }
  });

  return {
    sendPos: (pos) => {
      channel.send({
        type: 'broadcast',
        event: EV_POS,
        payload: { ...pos, k: self.kid_id } satisfies PosPacket,
      });
    },
    sendEmote: (kind, to) => {
      const payload: EmotePacket = { k: self.kid_id, e: kind, ...(to ? { to } : {}) };
      channel.send({ type: 'broadcast', event: EV_EMOTE, payload });
    },
    retrack: (next) => {
      presence = { ...presence, ...next };
      // track() with the same presence key overwrites our existing meta.
      channel.track(presence);
    },
    leave: async () => {
      try {
        await channel.untrack();
      } catch {
        // best-effort — we're tearing down anyway
      }
      await sb.removeChannel(channel);
    },
  };
}
