// What the operator can ask of /api/admin/communities, checked before it reaches
// the database.

export const COMMUNITY_NAME_MAX = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CommunityRequest =
  | { action: 'create'; name: string }
  | { action: 'delete'; communityId: string }
  | { action: 'add-family' | 'remove-family'; communityId: string; familyId: string };

/** A valid request, or null. Names are trimmed. */
export function parseCommunityRequest(raw: unknown): CommunityRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const { action, name, communityId, familyId } = raw as Record<string, unknown>;
  const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

  if (action === 'create') {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > COMMUNITY_NAME_MAX) return null;
    return { action, name: trimmed };
  }
  if (action === 'delete') return isId(communityId) ? { action, communityId } : null;
  if (action === 'add-family' || action === 'remove-family') {
    return isId(communityId) && isId(familyId) ? { action, communityId, familyId } : null;
  }
  return null;
}
