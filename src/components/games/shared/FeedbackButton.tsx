'use client';

// FeedbackButton — small 🧁 "Story Oven" button for game headers.
// Tapping opens the FeedbackModal, where a kid pops an idea/bug/wish into the
// Story Oven (voice or text) to be baked into a real change.

import { useState } from 'react';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';
import { useFamilyCapabilities } from '@/components/auth/FamilyCapabilities';
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
  const { canFileTicket } = useFamilyCapabilities();

  // Sixteen game hosts render this button and none of them know the tier.
  // Rather than teach each one, the button hides itself for a family whose
  // plan cannot file — the same rule the gated layout applies to the global
  // launcher. Outside the provider (the /ba arcade) this is always true.
  if (!canFileTicket) return null;

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
