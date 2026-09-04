// Family-login slug helpers.
//
// We use Supabase Auth's email+password flow under the hood, but the
// kid-facing UI says "Family login" instead of "Email". The slug
// (e.g. "shackleton") is mapped to a synthetic email
// (`shackleton@gamecakes.family`) before being passed to Supabase.
// This keeps the auth machinery — sessions, JWTs, RLS, getUser() —
// working exactly as designed without inventing custom auth.
//
// `gamecakes.family` is a real-looking but unregistered domain. Because
// `email_confirm: true` is set at admin.createUser time, Supabase never
// tries to deliver mail to it.

const SYNTHETIC_DOMAIN = 'gamecakes.family';

/** Slug rules — match what we tell users in the signup form copy. */
const SLUG_RE = /^[a-z0-9](-?[a-z0-9])+$/;

/** Normalize whatever the user typed into a canonical slug. Returns null
 *  if the input can't be cleaned into a valid slug. */
export function normalizeLoginName(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length < 3 || cleaned.length > 20) return null;
  if (!SLUG_RE.test(cleaned)) return null;
  return cleaned;
}

/** Map a clean slug to the synthetic email used with Supabase Auth. */
export function loginToEmail(login: string): string {
  return `${login}@${SYNTHETIC_DOMAIN}`;
}

/** Inverse: pull the slug back out of a synthetic email (used when
 *  showing the family's login on profile pages). Returns null if the
 *  email doesn't match the synthetic-domain pattern. */
export function emailToLogin(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  if (email.slice(at + 1) !== SYNTHETIC_DOMAIN) return null;
  return email.slice(0, at);
}
