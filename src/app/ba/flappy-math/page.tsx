// `/ba/flappy-math` — anonymous Flappy Math for the BA arcade.
//
// Same Phaser scene as /games/flappy-math, but launched through a
// two-button shell (Make 10 vs. easy addition) with the friendliest
// fixed preset. No account, no saving — see BaFlappyShell.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { hasBaAccess } from '@/lib/ba/access';
import BaFlappyShell from './BaFlappyShell';

export const metadata: Metadata = {
  title: 'Flappy Math — BA Kinder Ed Games',
  robots: { index: false, follow: false },
};

export default async function BaFlappyMathPage() {
  if (!(await hasBaAccess())) {
    redirect('/ba');
  }
  return <BaFlappyShell />;
}
