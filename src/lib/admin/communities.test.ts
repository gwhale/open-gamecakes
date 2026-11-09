import { describe, expect, it } from 'vitest';
import { COMMUNITY_NAME_MAX, parseCommunityRequest } from './communities';

const communityId = '11111111-1111-4111-8111-111111111111';
const familyId = '22222222-2222-4222-8222-222222222222';

describe('parseCommunityRequest', () => {
  it('accepts each action', () => {
    expect(parseCommunityRequest({ action: 'create', name: 'Cousins' })).toEqual({ action: 'create', name: 'Cousins' });
    expect(parseCommunityRequest({ action: 'delete', communityId })).toEqual({ action: 'delete', communityId });
    expect(parseCommunityRequest({ action: 'add-family', communityId, familyId })).toEqual({
      action: 'add-family',
      communityId,
      familyId,
    });
    expect(parseCommunityRequest({ action: 'remove-family', communityId, familyId })).toEqual({
      action: 'remove-family',
      communityId,
      familyId,
    });
  });

  it('trims a name', () => {
    expect(parseCommunityRequest({ action: 'create', name: '  Cousins ' })).toEqual({ action: 'create', name: 'Cousins' });
  });

  it.each([
    ['null', null],
    ['an unknown action', { action: 'drop', communityId }],
    ['a blank name', { action: 'create', name: '   ' }],
    ['a non-string name', { action: 'create', name: 7 }],
    ['an oversized name', { action: 'create', name: 'x'.repeat(COMMUNITY_NAME_MAX + 1) }],
    ['a malformed community id', { action: 'delete', communityId: 'abc' }],
    ['a missing family id', { action: 'add-family', communityId }],
    ['a malformed family id', { action: 'remove-family', communityId, familyId: "1' or 1=1" }],
  ])('rejects %s', (_label, raw) => {
    expect(parseCommunityRequest(raw)).toBeNull();
  });
});
