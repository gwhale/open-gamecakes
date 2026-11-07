// `/ba/word-memory` — anonymous Word Memory for the BA arcade.
//
// Same 5×5 sight-word match as /games/word-memory, but with zero account
// plumbing: no kid lookup, no skill/tier resolution, no progress saved.
// The gate check redirects to /ba (which renders the password form)
// rather than rendering a second copy of the form here.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { hasBaAccess } from '@/lib/ba/access';
import BaWordMemoryShell from './BaWordMemoryShell';

export const metadata: Metadata = {
  title: 'Word Memory — BA Kinder Ed Games',
  robots: { index: false, follow: false },
};

export default async function BaWordMemoryPage() {
  if (!(await hasBaAccess())) {
    redirect('/ba');
  }
  return <BaWordMemoryShell />;
}
