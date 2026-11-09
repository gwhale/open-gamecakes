// A child's name must not reach anyone outside their family.
//
// regions.local.ts and registry.local.ts ship to every family on this
// deployment, and to public scripts, so their display strings must stay neutral.
// The real names are only in scripts/ci/protected-names.json, which the public
// cut leaves out. Without that file there are no names to check, and the
// local seams ship empty anyway.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_REGISTRY } from '@/lib/games/registry';
import { LOCAL_GAMES } from '@/lib/games/registry.local';
import { LOCAL_REGIONS } from './regions.local';

const CONFIG = 'scripts/ci/protected-names.json';
const names: string[] = existsSync(CONFIG)
  ? (JSON.parse(readFileSync(CONFIG, 'utf8')) as { names: string[] }).names
  : [];

function mentionsAName(text: string): boolean {
  const lower = text.toLowerCase();
  return names.some((n) => lower.includes(n.toLowerCase()));
}

describe('what other families and visitors can read', () => {
  it('keeps land names and descriptions neutral', () => {
    for (const r of LOCAL_REGIONS) {
      expect(mentionsAName(r.name), r.slug).toBe(false);
      expect(mentionsAName(r.theme), r.slug).toBe(false);
      expect(mentionsAName(r.slug), r.name).toBe(false);
    }
  });

  it('keeps game labels neutral', () => {
    for (const g of [...LOCAL_GAMES, ...GAME_REGISTRY]) {
      expect(mentionsAName(g.label), g.slug).toBe(false);
      expect(mentionsAName(g.slug), g.label).toBe(false);
    }
  });
});
