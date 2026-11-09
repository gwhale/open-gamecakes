// A family's contact address, from a form. It is never a login and nothing mails it
// on its own; it is how the operator can reach a grown-up who needs help.

const SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_LENGTH = 254;

/** The cleaned address, or null if it does not look like one. */
export function normalizeContactEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= MAX_LENGTH && SHAPE.test(email) ? email : null;
}
