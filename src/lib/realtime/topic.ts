import 'server-only';

// Realtime topic-token derivation (server-only).
//
// The town presence layer (Phase A of the multiplayer plan) runs on a PUBLIC
// Supabase Realtime channel — any browser that knows the channel name can
// join it. We do NOT want the raw `family_id` (a database UUID) to be that
// name, for two reasons:
//   1. It would put a real primary key into every kid's DOM / WebSocket frames.
//   2. UUIDs from adjacent families are trivially guessable-adjacent, so a
//      curious kid could type a sibling-of-a-sibling's id and eavesdrop.
//
// Instead the channel name is `town:{topicToken}`, where topicToken is an
// HMAC of the family_id under a server-held secret. Properties this buys us:
//   - Deterministic: both iPads in the same family derive the SAME token from
//     the SAME family_id, so they land on the same channel with no handshake.
//   - Unguessable: without REALTIME_TOPIC_SECRET you cannot go family_id →
//     token, and you cannot go token → family_id at all (one-way hash).
//   - Zero-DB: no table, no migration, no per-session mint — it's a pure
//     function of (secret, family_id).
//
// This is deliberately NOT a JWT / private-channel scheme. The payloads are
// low-sensitivity (first names, cupcake colors, toy-world x/y within a single
// family), so an unguessable public channel is the right amount of security
// for v1. The documented upgrade path — mint a short-lived JWT and use
// `supabase.realtime.setAuth()` for RLS-backed private channels — lives in the
// plan (MULTIPLAYER-PLAN.md §A1) for when cross-family or higher-sensitivity
// data enters the picture.
//
// Because this reads REALTIME_TOPIC_SECRET, it must never reach the client
// bundle — hence `import 'server-only'`. Call it from Server Components /
// Route Handlers and pass ONLY the resulting token down as a prop.

import { createHmac } from 'node:crypto';

// 32 hex chars = 128 bits of the HMAC output. That's far more than enough to
// make the channel name unguessable while keeping it short enough to read in a
// network trace when debugging. (The full digest is 64 hex chars; we slice.)
const TOPIC_TOKEN_LEN = 32;

/**
 * Derive the stable, unguessable town-channel token for a family.
 *
 * Returns `null` — meaning "multiplayer is not available for this request" —
 * when either the server secret is unset (env not configured, e.g. a preview
 * deploy that hasn't had REALTIME_TOPIC_SECRET added yet) or no family_id is
 * available (guest sandbox, which has no family and gets no presence layer).
 *
 * Callers treat `null` as "render the town in single-player mode": never
 * throw, never block the page — the town is the post-login landing hub.
 */
export function deriveTownTopicToken(familyId: string | null | undefined): string | null {
  const secret = process.env.REALTIME_TOPIC_SECRET;
  if (!secret) return null;
  if (!familyId) return null;

  return createHmac('sha256', secret)
    .update(familyId)
    .digest('hex')
    .slice(0, TOPIC_TOKEN_LEN);
}
