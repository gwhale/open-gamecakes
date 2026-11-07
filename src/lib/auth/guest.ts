// Guest profile — a well-known "playtest" kid whose sessions don't count.
//
// Any code that needs to know "is the active kid the sandbox profile?" should
// import GUEST_KID_ID and compare against the active-kid cookie. The row
// itself is seeded by supabase/migrations/0012_remove_pins_add_guest.sql.
//
// Why a UUID check and not a database flag: adding a column to `kids` creates
// a chicken-and-egg deploy problem — the code selecting the column would 500
// until the migration runs. A hardcoded UUID avoids that; the only way to
// "be the guest" is to have this specific id in your lw_kid cookie, which
// only /kids/page.tsx can set via the select API.

export const GUEST_KID_ID = '33333333-3333-4333-8333-333333333333';

/** True iff the given kid id is the sandbox Guest profile. */
export function isGuest(kidId: string | null | undefined): boolean {
  return kidId === GUEST_KID_ID;
}
