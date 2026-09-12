// Where "back" goes, and the two ways it went wrong in the public arcade.
//
// Found by driving gamecakes.org/play in a real browser: eleven of sixteen
// arcade games exited to /town — the town a signed-out stranger has no account
// for — while five exited correctly to /play. The split was not random. The
// five were Phaser games, and PhaserGameHost is the only host that reads the
// backHref prop the arcade was passing; every other host resolves its back
// target through this module and nowhere else.
//
// So the arcade is recognised HERE now, by pathname, and these are the cases
// that must not regress.

import { describe, expect, it } from 'vitest';
import { resolveGameBackTarget, FROM_GAMES_MENU, PLAY_PREFIX } from './back-nav';

describe('resolveGameBackTarget', () => {
  it('sends an arcade game back to the arcade', () => {
    const t = resolveGameBackTarget(null, '/play/marble-maze');
    expect(t).toEqual({ href: '/play', label: '← All games' });
  });

  it('works for a game opened DIRECTLY from a shared link', () => {
    // The reason this keys off pathname rather than a ?from=play param. An
    // arcade link gets copied to someone else, who arrives with no query
    // string at all and still must not be dumped into /town.
    expect(resolveGameBackTarget(null, '/play/cakey-road')?.href).toBe('/play');
  });

  it('keeps the arcade even when a stale ?from= rode along on the link', () => {
    // /games is a signed-in surface. A copied URL carrying ?from=games must not
    // send a signed-out visitor somewhere they cannot go.
    const t = resolveGameBackTarget(FROM_GAMES_MENU, '/play/castle-crumble');
    expect(t?.href).toBe('/play');
  });

  it('still sends an All Games arrival back to All Games', () => {
    const t = resolveGameBackTarget(FROM_GAMES_MENU, '/games/marble-maze');
    expect(t).toEqual({ href: '/games', label: '← All Games' });
  });

  it('leaves the town default alone for a game walked to in the city', () => {
    // null means "keep the host's own default", which is /town.
    expect(resolveGameBackTarget(null, '/games/marble-maze')).toBeNull();
    expect(resolveGameBackTarget(null, null)).toBeNull();
    expect(resolveGameBackTarget(null, undefined)).toBeNull();
  });

  it('does not mistake the arcade INDEX for a game in the arcade', () => {
    // /play itself is the menu. Only /play/<slug> is a game.
    expect(resolveGameBackTarget(null, '/play')).toBeNull();
  });

  it('does not match a route that merely starts with the same letters', () => {
    expect(resolveGameBackTarget(null, '/playground/thing')).toBeNull();
    expect(PLAY_PREFIX).toBe('/play/');
  });
});
