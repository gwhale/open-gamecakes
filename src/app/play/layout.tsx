// Guest play (/play and /play/[slug]) is outside (gated), so it mounts the
// in-game Cakey reactions itself. See CakeyReactions for what they do.

import CakeyReactions from '@/components/games/shared/CakeyReactions';

export default function PlayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <CakeyReactions />
    </>
  );
}
