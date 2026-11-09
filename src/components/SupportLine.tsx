// How a locked-out family reaches the operator, who can reset a password or PIN on
// /admin. The address comes from SUPPORT_EMAIL so it stays out of the public cut. With
// it unset or malformed the line is absent: a self-hoster must not send families to a
// mailbox that does not exist. Server-only by use: the variable has no NEXT_PUBLIC_ prefix.

import { normalizeContactEmail } from '@/lib/auth/contact-email';

export default function SupportLine({ lostThing }: { lostThing: string }) {
  const email = normalizeContactEmail(process.env.SUPPORT_EMAIL);
  if (!email) return null;
  return (
    <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
      Lost your {lostThing}? Email{' '}
      <a href={`mailto:${email}`} className="font-semibold underline">
        {email}
      </a>{' '}
      for a new one.
    </p>
  );
}
