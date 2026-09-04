// `/map` layout — ensures an active kid is selected before rendering the map.
//
// Without this check, a returning user whose active-kid cookie got cleared
// (e.g., tapped "Switch Kid") could navigate directly to /map and see the
// map shell with no kid context. Sending them to /kids instead is the right
// recovery path.

import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';

export default async function MapLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const activeKid = await getActiveKid();
  if (!activeKid) redirect('/kids');
  return <>{children}</>;
}
