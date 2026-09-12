// Outbound email — one narrow door, deliberately hard to misuse.
//
// SAFETY MODEL
// This module is the ONLY place the app can send mail, and it will not send
// anything at all unless RESEND_API_KEY is set. With no key it logs what it
// WOULD have sent and returns `skipped`. That is the desired behaviour in local
// dev, in previews, and in CI: building or testing the digest must never put
// real mail in a real person's inbox.
//
// Recipients are never derived, inferred, or discovered — they come only from
// families.digest_emails, which a grown-up types into the parent portal behind
// the PIN gate. Nothing in this file reads auth.users, whose addresses are
// synthetic login names (`shackleton@gamecakes.family`) and are not mailboxes.
//
// Resend is used because it is the least-ceremony provider for Next on Vercel
// (one env var, plain HTTPS, no SDK needed). It is called over fetch rather than
// through a package so swapping providers is one function body, not a dependency
// change.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendResult {
  status: 'sent' | 'skipped' | 'failed';
  detail: string;
}

export interface Mail {
  to: string[];
  subject: string;
  html: string;
  /** Plain-text alternative. Always supply one — a mail with no text part is a
   *  spam signal, and some clients render it as an empty message. */
  text: string;
}

/** Is outbound mail configured? Callers use this to decide whether to even do
 *  the work of building a digest. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_FROM);
}

export async function sendEmail(mail: Mail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;

  const recipients = mail.to.filter((a) => a && a.includes('@'));
  if (recipients.length === 0) {
    return { status: 'skipped', detail: 'no recipients' };
  }

  if (!key || !from) {
    // The safe default. Log enough to verify the digest is being built
    // correctly, without the content, which can be long.
    console.info(
      `[email] NOT CONFIGURED — would have sent "${mail.subject}" to ${recipients.length} recipient(s). ` +
        'Set RESEND_API_KEY and DIGEST_FROM to enable.',
    );
    return { status: 'skipped', detail: 'RESEND_API_KEY/DIGEST_FROM not set' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[email] send failed:', res.status, body.slice(0, 300));
      return { status: 'failed', detail: `provider ${res.status}` };
    }
    return { status: 'sent', detail: `${recipients.length} recipient(s)` };
  } catch (err) {
    console.warn('[email] send threw:', (err as Error).message);
    return { status: 'failed', detail: (err as Error).message };
  }
}
