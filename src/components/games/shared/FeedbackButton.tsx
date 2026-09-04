'use client';

// FeedbackButton — small 🧁 "Story Oven" button for game headers.
// Tapping opens the FeedbackModal, where a kid pops an idea/bug/wish into the
// Story Oven (voice or text) to be baked into a real change.

import { useState } from 'react';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';
import FeedbackModal from './FeedbackModal';

export default function FeedbackButton({
  gameSlug,
  kidName,
  className = '',
}: {
  gameSlug: string;
  kidName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ChromeNavButton
        onClick={() => setOpen(true)}
        aria-label="Story Oven — pop in an idea, bug, or wish about this game"
        title="Story Oven"
        variant="dark"
        size="sm"
        className={className}
      >
        🧁 Story Oven
      </ChromeNavButton>
      {open ? (
        <FeedbackModal
          gameSlug={gameSlug}
          kidName={kidName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
