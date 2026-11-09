// Root `/` — after the parent gate has let them through, decide where to go.
//
// If an active kid is already selected → drop straight into the map.
// Otherwise → show the kid picker.
//
// This lets a returning user on the same browser skip the kid picker and
// land where they left off.

import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';

export default async function RootPage() {
  const activeKid = await getActiveKid();
  if (activeKid) redirect('/town');
  redirect('/kids');
}
