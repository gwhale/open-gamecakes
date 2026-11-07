import 'server-only';

// Server-side "builds changed" ping, for changes that don't come from a kid's
// open town.
//
// A kid's own place/remove announces from the browser over the channel it is
// already joined to. A grown-up removing a piece from /parent/builds has no
// town open and no channel, so without this the siblings' towns kept showing
// the removed piece until a reload. Realtime's REST broadcast endpoint lets
// the server send into the same public channel without subscribing.
//
// Best-effort by design: the removal has already committed when this runs,
// and a missed ping only means a stale town until the next reload — never a
// reason to fail the grown-up's request. Never throws; the caller runs it in
// after() so the redirect doesn't wait on it.

import { deriveTownTopicToken } from './topic';
import { buildsChangedMessage } from './build-message';

const TIMEOUT_MS = 2000;

export async function announceBuildsChanged(familyId: string): Promise<void> {
  const token = deriveTownTopicToken(familyId);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  // No token = multiplayer off for this deploy, so nobody is listening.
  if (!token || !url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      // Same pair supabase-js sends with the secret key.
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [buildsChangedMessage(token)] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 202) console.warn('[builds] broadcast answered', res.status);
  } catch (e) {
    console.warn('[builds] broadcast failed', e);
  }
}
