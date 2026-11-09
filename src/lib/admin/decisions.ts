// What is waiting on the deployment owner, shown in the Decisions section of /admin.
//
// Two kinds:
// - Missing Vercel settings, read live from the environment, so each one leaves
//   the list by itself once it is set (missingSettings).
// - Asks, in the admin_decisions table (migration 0070). A session adds one with
//   SQL (upsert by slug); the operator answers it on /admin; the session reads
//   `answer` and `note` back. Answering replaces any earlier answer, and
//   "reopen" clears it. This replaced the hand-kept OPEN_DECISIONS list.

import { normalizeContactEmail } from '@/lib/auth/contact-email';

export type MissingSetting = { name: string; why: string; value: string };

type Env = Record<string, string | undefined>;

export function missingSettings(env: Env = process.env): MissingSetting[] {
  const set = (name: string) => !!env[name]?.trim();
  const missing: MissingSetting[] = [];
  if (!normalizeContactEmail(env.SUPPORT_EMAIL ?? '')) {
    missing.push({
      name: 'SUPPORT_EMAIL',
      why: 'Locked-out families see this address on the login page. The line stays hidden until it is set.',
      value: 'The address families should write to. It is shown publicly.',
    });
  }
  if (!set('RESEND_API_KEY')) {
    missing.push({
      name: 'RESEND_API_KEY',
      why: 'No email of any kind sends without it: new-family notes, the daily summary, the weekly parent digest.',
      value: 'The Gamecakes Resend API key.',
    });
  }
  if (!set('DIGEST_FROM')) {
    missing.push({
      name: 'DIGEST_FROM',
      why: 'The sender on every email. Resend refuses a domain it has not verified.',
      value: 'For example: Gamecakes <hello@gamecakes.org>',
    });
  }
  if (!set('ADMIN_NOTIFY_EMAIL')) {
    missing.push({
      name: 'ADMIN_NOTIFY_EMAIL',
      why: 'Where new-family notes and the daily summary go.',
      value: 'Your address. Separate several with commas.',
    });
  }
  if (!set('CRON_SECRET')) {
    missing.push({
      name: 'CRON_SECRET',
      why: 'The daily summary and weekly digest refuse to run without it.',
      value: 'Any long random string.',
    });
  }
  return missing;
}

export interface DecisionRow {
  id: string;
  title: string;
  why: string;
  steps: string[];
  options: string[];
  recommended: string | null;
  tags: string[];
  link: string | null;
  status: 'open' | 'answered' | 'dropped';
  answer: string | null;
  note: string | null;
  answered_at: string | null;
  created_at: string;
}

export const DECISION_NOTE_MAX = 2000;

export type DecisionRequest =
  | { action: 'answer'; id: string; answer: string; note: string }
  | { action: 'reopen'; id: string };

export function parseDecisionRequest(body: unknown): DecisionRequest | null {
  if (!body || typeof body !== 'object') return null;
  const { action, id, answer, note } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) return null;
  if (action === 'reopen') return { action, id };
  if (action !== 'answer') return null;
  if (typeof answer !== 'string' || answer.length === 0 || answer.length > 200) return null;
  const n = typeof note === 'string' ? note.trim() : '';
  if (n.length > DECISION_NOTE_MAX) return null;
  return { action, id, answer, note: n };
}

/** Open asks first, oldest first, so the longest-waiting call is on top; then
 *  answered ones, newest answer first. */
export function sortDecisions(rows: DecisionRow[]): DecisionRow[] {
  const open = rows.filter((r) => r.status === 'open').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = rows
    .filter((r) => r.status !== 'open')
    .sort((a, b) => (b.answered_at ?? b.created_at).localeCompare(a.answered_at ?? a.created_at));
  return [...open, ...done];
}
