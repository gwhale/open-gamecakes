// Town builds, live — tells siblings' open towns that the family's builds
// changed, so a road one kid lays appears for the others without a reload.
//
// The message carries no build data, only "something changed". Receivers
// re-read the list from GET /api/town/builds, which checks the family. So the
// channel can't be used to put a piece in anyone's town: the worst a forged
// message does is trigger a harmless re-read.
//
// Same family-scoped, unguessable topic token as the presence channel
// (src/lib/realtime/topic.ts), under its own `builds:` prefix so it never
// mixes with the `town:` presence channel or needs ?mp=1.

'use client';

import { supabaseBrowser } from '@/lib/supabase/browser';
import { BUILDS_CHANGED_EVENT as EV_CHANGED, buildsTopic } from './build-message';

export interface BuildChannelHandle {
  /** Tell the rest of the family the builds changed. */
  announce: () => void;
  leave: () => Promise<void>;
}

export function joinBuildChannel(
  topicToken: string,
  /** Sender id, so a second tab of the same kid still refreshes but the
   *  sending tab doesn't re-read its own change. */
  selfId: string,
  onChanged: () => void,
): BuildChannelHandle {
  const sb = supabaseBrowser();
  const channel = sb.channel(buildsTopic(topicToken), {
    config: { broadcast: { self: false, ack: false } },
  });
  channel.on('broadcast', { event: EV_CHANGED }, ({ payload }) => {
    if ((payload as { s?: string } | undefined)?.s === selfId) return;
    onChanged();
  });
  channel.subscribe();
  return {
    announce: () => {
      channel.send({ type: 'broadcast', event: EV_CHANGED, payload: { s: selfId } });
    },
    leave: async () => {
      await sb.removeChannel(channel);
    },
  };
}
