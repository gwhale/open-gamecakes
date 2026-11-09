'use client';

// The 🧁 Story Oven as a top-bar pill, for pages whose bottom-right corner
// belongs to game controls. The town is the first: the floating launcher sat
// on top of the jet ski's throttle ("the story oven button is in the way of
// the boost, move it to top nav", Story Oven ticket 2026-10-20), so
// GlobalFeedbackLauncher skips /town and the town header renders this instead.
// Same modal, same tier gate.

import { useState } from 'react';
import { ChromeNavButton } from '@/components/ui/ChromeNavLink';
import { useFamilyCapabilities } from '@/components/auth/FamilyCapabilities';
import FeedbackModal from './FeedbackModal';

// Dark in both town headers, like SoundToggle beside it.
export default function StoryOvenButton({ kidName }: { kidName?: string }) {
  const [open, setOpen] = useState(false);
  const caps = useFamilyCapabilities();
  if (!caps.canFileTicket) return null;

  return (
    <>
      <ChromeNavButton
        onClick={() => setOpen(true)}
        aria-label="Story Oven — pop in an idea, bug, or wish"
        title="Story Oven"
        variant="dark"
        size="sm"
      >
        🧁
      </ChromeNavButton>
      {open ? <FeedbackModal kidName={kidName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
