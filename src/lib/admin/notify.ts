// Mail to the operator: one note per new family, and a daily summary.
//
// ADMIN_NOTIFY_EMAIL is the only source of recipients, so a deployment that has not
// set it sends nothing. These never name a kid. A failure here must not fail the
// signup that triggered it.

import { sendEmail, type SendResult } from '@/lib/email/send';
import type { Overview } from './overview';

const DAY = 24 * 60 * 60 * 1000;

export function adminRecipients(raw: string | null | undefined = process.env.ADMIN_NOTIFY_EMAIL): string[] {
  return (raw ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.includes('@'));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function send(subject: string, text: string): Promise<SendResult> {
  return sendEmail({
    to: adminRecipients(),
    subject,
    text,
    html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  });
}

export function newFamilyNote(family: { name: string; login: string; contactEmail: string; tier: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: `New Gamecakes family: ${family.name}`,
    text: [
      `${family.name} just signed up.`,
      `Login: ${family.login}`,
      `Email: ${family.contactEmail}`,
      `Plan: ${family.tier}`,
    ].join('\n'),
  };
}

/** Safe to await inside signup: it logs a failure and never throws. */
export async function notifyNewFamily(family: Parameters<typeof newFamilyNote>[0]): Promise<void> {
  try {
    const { subject, text } = newFamilyNote(family);
    await send(subject, text);
  } catch (error) {
    console.error('[admin-notify] new family note failed:', error instanceof Error ? error.message : error);
  }
}

/** The last 24 hours, or null when nothing happened, so a quiet day sends no mail. */
export function dailySummary(overview: Overview, now: Date): { subject: string; text: string } | null {
  const recent = (iso: string | null) => !!iso && now.getTime() - Date.parse(iso) <= DAY;
  const joined = overview.families.filter((family) => recent(family.createdAt));
  const active = overview.families.filter((family) => recent(family.lastActiveAt));
  const { rounds24h, openTickets, families } = overview.totals;
  if (joined.length === 0 && active.length === 0 && rounds24h === 0) return null;

  const lines = [
    `New families: ${joined.length}`,
    ...joined.map((family) => `  ${family.name}`),
    `Active families: ${active.length}`,
    ...active.map((family) => `  ${family.name}`),
    `Rounds played: ${rounds24h}`,
    `Open tickets: ${openTickets}`,
    `All families: ${families}`,
  ];
  return { subject: `Gamecakes today: ${active.length} active, ${joined.length} new`, text: lines.join('\n') };
}

export async function sendDailySummary(overview: Overview, now: Date): Promise<SendResult | null> {
  const summary = dailySummary(overview, now);
  return summary ? send(summary.subject, summary.text) : null;
}
