import { describe, expect, it } from 'vitest';
import {
  DECISION_NOTE_MAX,
  missingSettings,
  parseDecisionRequest,
  sortDecisions,
  type DecisionRow,
} from './decisions';

const ALL_SET = {
  SUPPORT_EMAIL: 'help@example.org',
  RESEND_API_KEY: 're_x',
  DIGEST_FROM: 'Gamecakes <hello@example.org>',
  ADMIN_NOTIFY_EMAIL: 'me@example.org',
  CRON_SECRET: 'long-random',
};

describe('missingSettings', () => {
  it('lists every setting when none is set', () => {
    expect(missingSettings({}).map((s) => s.name)).toEqual([
      'SUPPORT_EMAIL',
      'RESEND_API_KEY',
      'DIGEST_FROM',
      'ADMIN_NOTIFY_EMAIL',
      'CRON_SECRET',
    ]);
  });

  it('is empty when all are set', () => {
    expect(missingSettings(ALL_SET)).toEqual([]);
  });

  it('treats blank values and an invalid support address as missing', () => {
    const names = missingSettings({ ...ALL_SET, CRON_SECRET: '  ', SUPPORT_EMAIL: 'not an email' }).map((s) => s.name);
    expect(names).toEqual(['SUPPORT_EMAIL', 'CRON_SECRET']);
  });
});

describe('parseDecisionRequest', () => {
  it('accepts an answer with a trimmed note', () => {
    expect(parseDecisionRequest({ action: 'answer', id: 'supabase-pro', answer: 'Not yet', note: ' later ' })).toEqual({
      action: 'answer',
      id: 'supabase-pro',
      answer: 'Not yet',
      note: 'later',
    });
  });

  it('accepts a reopen', () => {
    expect(parseDecisionRequest({ action: 'reopen', id: 'supabase-pro' })).toEqual({ action: 'reopen', id: 'supabase-pro' });
  });

  it('rejects bad ids, empty answers and long notes', () => {
    expect(parseDecisionRequest({ action: 'answer', id: 'Bad Id', answer: 'x' })).toBeNull();
    expect(parseDecisionRequest({ action: 'answer', id: 'ok', answer: '' })).toBeNull();
    expect(parseDecisionRequest({ action: 'answer', id: 'ok', answer: 'x', note: 'n'.repeat(DECISION_NOTE_MAX + 1) })).toBeNull();
    expect(parseDecisionRequest({ action: 'delete', id: 'ok' })).toBeNull();
    expect(parseDecisionRequest(null)).toBeNull();
  });
});

const row = (id: string, status: DecisionRow['status'], created_at: string, answered_at: string | null = null): DecisionRow => ({
  id,
  title: id,
  why: '',
  steps: [],
  options: ['Yes'],
  recommended: null,
  tags: [],
  link: null,
  status,
  answer: null,
  note: null,
  answered_at,
  created_at,
});

describe('sortDecisions', () => {
  it('puts open asks first, longest waiting on top, then the latest answers', () => {
    const sorted = sortDecisions([
      row('done-old', 'answered', '2026-11-01', '2026-11-02'),
      row('open-new', 'open', '2026-11-07'),
      row('done-new', 'answered', '2026-11-01', '2026-11-06'),
      row('open-old', 'open', '2026-11-03'),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['open-old', 'open-new', 'done-new', 'done-old']);
  });
});
