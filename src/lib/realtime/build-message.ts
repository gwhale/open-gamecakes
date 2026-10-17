// The "builds changed" broadcast, in one place for both senders.
//
// A kid's tab sends it over the WebSocket (build-channel.ts); a grown-up's
// removal sends it from the server over Realtime's REST endpoint
// (build-broadcast.ts). Receivers match on topic + event exactly, so if the
// two senders spelled either differently the grown-up's removal would go out
// on a channel nobody is listening to — silently, since a broadcast to an
// empty topic still answers 202. Hence one module, no 'use client' and no
// 'server-only', importable from both sides.

export const BUILDS_CHANGED_EVENT = 'changed';

/** Channel name for a family's builds. Same token as the presence channel,
 *  own prefix (see build-channel.ts). */
export function buildsTopic(topicToken: string): string {
  return `builds:${topicToken}`;
}

/** Sender id the server uses. Never equals a browser's selfId, so every open
 *  tab — including the kid's own — re-reads. */
export const SERVER_SENDER = 'parent';

/**
 * One message for POST /realtime/v1/api/broadcast, shaped the way
 * realtime-js's own httpSend() builds it: the bare topic (no `realtime:`
 * prefix) and `private: false`, because the builds channel is public.
 */
export function buildsChangedMessage(topicToken: string, sender: string = SERVER_SENDER) {
  return {
    topic: buildsTopic(topicToken),
    event: BUILDS_CHANGED_EVENT,
    payload: { s: sender },
    private: false,
  };
}
