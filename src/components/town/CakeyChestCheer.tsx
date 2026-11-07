'use client';

// Cakey's reaction when a hidden land chest opens: the same per-item line the
// ocean's radio says, but with Cakey himself on screen, celebrating, his mouth
// moving while the voice plays. On land there is no radio to explain where
// the voice comes from, so he has to be seen saying it.

import { useEffect, useSyncExternalStore } from 'react';
import GamecakesMascot from '@/components/GamecakesMascot';
import SpokenText from '@/components/town/SpokenText';
import { speak, isTalking, subscribeTalking } from '@/lib/town/cakey-voice';

export default function CakeyChestCheer({
  line,
  onDone,
}: {
  line: string;
  onDone: () => void;
}): React.ReactElement {
  const talking = useSyncExternalStore(subscribeTalking, isTalking, () => false);

  useEffect(() => {
    speak(line);
    // Reading speed with a floor, like the ocean's radio bubble, so it leaves
    // on its own rather than becoming a label stuck to the screen.
    const t = window.setTimeout(onDone, 3200 + line.length * 50);
    return () => window.clearTimeout(t);
  }, [line, onDone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
      <div className="animate-cakey-pop flex max-w-sm items-end gap-3">
        <GamecakesMascot mood={talking ? 'happy' : 'celebrate'} talking={talking} size={84} />
        <div className="relative mb-6 rounded-3xl rounded-bl-md bg-white/95 px-4 py-3 font-display text-sm font-bold text-zinc-800 shadow-lg dark:bg-zinc-800/95 dark:text-zinc-100">
          <SpokenText text={line} />
        </div>
      </div>
    </div>
  );
}
