// The weekly parent digest — what each kid did, in plain language.
//
// WRITTEN FOR A PARENT, NOT FOR THE SCHEMA. Two rules this file follows and the
// dashboards historically did not:
//
//  1. Never say "accuracy". One `attempts` row is a game ROUND, and `correct`
//     means that round's efficiency cleared a threshold. Per-question accuracy
//     is not recorded anywhere. Calling it accuracy is how a parent ends up
//     believing their child got 14% of chess QUESTIONS right when the truth is
//     they finished 14% of chess ROUNDS well.
//  2. Lead with the thing worth acting on. A wall of counts is not a report.
//     The digest opens with what changed and what is stuck, then the numbers.
//
// Pure data + formatting. No DB access and no sending — the cron route supplies
// rows and hands the result to the mail layer, which keeps this unit-checkable
// and means building a digest can never accidentally send one.

import {
  subjectMix as computeSubjectMix,
  SUBJECT_META,
  type SubjectCount,
} from '@/lib/parent/subjects';
import type { GameSubject } from '@/lib/games/registry';

export interface DigestAttempt {
  kid_id: string;
  game_slug: string | null;
  completed: boolean | null;
  efficiency: number | null;
  response_time_ms: number | null;
  created_at: string;
}

export interface DigestSkill {
  kid_id: string;
  skill_name: string;
  subject: string;
  current_tier: number;
  on_track_tier: number | null;
  mastery_pct: number | null;
}

export interface DigestKid {
  id: string;
  name: string;
}

export interface KidDigest {
  name: string;
  rounds: number;
  minutes: number;
  activeDays: number;
  finishedPct: number | null;
  /** The balance of what they practiced — Math / Reading / Logic — this week.
   *  This is the summary a parent should read first: not just how much, but
   *  what KIND. Tracked rounds only; empty if nothing had a recorded game. */
  subjectMix: SubjectCount[];
  topGames: { label: string; rounds: number }[];
  /** Skills furthest AHEAD of grade level, best first. */
  ahead: { skill: string; by: number }[];
  /** Skills below grade level, worst first — the actionable list. */
  behind: { skill: string; by: number; mastery: number | null }[];
  /** True when the kid did nothing at all this week. */
  quiet: boolean;
}

export interface WeeklyDigest {
  weekLabel: string;
  kids: KidDigest[];
  /** One sentence a parent could read and nothing else. */
  headline: string;
}

/** Monday 00:00 of the week containing `d` (local). */
export function weekStart(d: Date = new Date()): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (s.getDay() + 6) % 7; // Mon=0
  s.setDate(s.getDate() - dow);
  return s;
}

function fmtRange(start: Date, end: Date): string {
  const f = (x: Date) => x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(end)}`;
}

export function buildWeeklyDigest(args: {
  kids: DigestKid[];
  attempts: DigestAttempt[];
  skills: DigestSkill[];
  gameLabel: (slug: string) => string;
  gameSubject: (slug: string) => GameSubject | null;
  start: Date;
  end: Date;
}): WeeklyDigest {
  const { kids, attempts, skills, gameLabel, gameSubject, start, end } = args;

  const perKid: KidDigest[] = kids.map((kid) => {
    const mine = attempts.filter((a) => a.kid_id === kid.id);
    const rounds = mine.length;
    const minutes = Math.round(mine.reduce((n, a) => n + (a.response_time_ms ?? 0), 0) / 60000);
    const activeDays = new Set(mine.map((a) => a.created_at.slice(0, 10))).size;
    const finishable = mine.filter((a) => a.completed !== null);
    const finishedPct = finishable.length
      ? Math.round((finishable.filter((a) => a.completed).length / finishable.length) * 100)
      : null;

    const byGame = new Map<string, number>();
    for (const a of mine) {
      if (!a.game_slug) continue;
      byGame.set(a.game_slug, (byGame.get(a.game_slug) ?? 0) + 1);
    }
    const topGames = [...byGame.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([slug, n]) => ({ label: gameLabel(slug), rounds: n }));

    const mySkills = skills.filter((s) => s.kid_id === kid.id && s.on_track_tier != null);
    const ahead = mySkills
      .map((s) => ({ skill: s.skill_name, by: s.current_tier - (s.on_track_tier as number) }))
      .filter((s) => s.by > 0)
      .sort((a, b) => b.by - a.by)
      .slice(0, 3);
    const behind = mySkills
      .map((s) => ({
        skill: s.skill_name,
        by: (s.on_track_tier as number) - s.current_tier,
        mastery: s.mastery_pct,
      }))
      .filter((s) => s.by > 0)
      .sort((a, b) => b.by - a.by)
      .slice(0, 3);

    const subjectMix = computeSubjectMix(mine, gameSubject);

    return { name: kid.name, rounds, minutes, activeDays, finishedPct, subjectMix, topGames, ahead, behind, quiet: rounds === 0 };
  });

  // Headline: the one thing worth knowing. Prefer a concern over a celebration —
  // a parent skimming on a phone should see the actionable item first.
  const withBehind = perKid.filter((k) => !k.quiet && k.behind.length > 0);
  const played = perKid.filter((k) => !k.quiet);
  let headline: string;
  if (played.length === 0) {
    headline = 'Nobody played this week.';
  } else if (withBehind.length > 0) {
    const k = withBehind[0];
    headline = `${k.name} is below grade level on ${k.behind[0].skill.toLowerCase()} — worth a nudge.`;
  } else {
    const best = [...played].sort((a, b) => b.rounds - a.rounds)[0];
    headline = `${best.name} played the most this week (${best.rounds} rounds) and nothing is below grade level.`;
  }

  return { weekLabel: fmtRange(start, end), kids: perKid, headline };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderDigestText(d: WeeklyDigest): string {
  const L: string[] = [
    `Gamecakes — week of ${d.weekLabel}`,
    '',
    d.headline,
    '',
    'What we watch most is the learning mix — how the week split across math, reading, and logic.',
    '',
  ];
  for (const k of d.kids) {
    if (k.quiet) {
      L.push(`${k.name}: no play this week.`, '');
      continue;
    }
    L.push(`${k.name}: ${k.rounds} rounds over ${k.activeDays} day(s), ${k.minutes} min.`);
    if (k.subjectMix.length)
      L.push(`  Learning mix: ${k.subjectMix.map((m) => `${SUBJECT_META[m.subject].label} ${m.rounds}`).join(' · ')}`);
    if (k.finishedPct !== null) L.push(`  Finished ${k.finishedPct}% of rounds.`);
    if (k.topGames.length) L.push(`  Most played: ${k.topGames.map((g) => `${g.label} (${g.rounds})`).join(', ')}`);
    if (k.behind.length) L.push(`  Below grade level: ${k.behind.map((b) => `${b.skill} (${b.by} tier${b.by === 1 ? '' : 's'} behind)`).join(', ')}`);
    if (k.ahead.length) L.push(`  Ahead: ${k.ahead.map((a) => `${a.skill} (+${a.by})`).join(', ')}`);
    L.push('');
  }
  L.push('A "round" is one play of a game, not one question.');
  L.push('Gamecakes does not record per-question accuracy, so this report never claims any.');
  return L.join('\n');
}

export function renderDigestHtml(d: WeeklyDigest, portalUrl: string): string {
  const kidBlocks = d.kids
    .map((k) => {
      if (k.quiet) {
        return `<tr><td style="padding:14px 0;border-top:1px solid #e6e6e2">
          <div style="font-size:16px;font-weight:700">${esc(k.name)}</div>
          <div style="font-size:14px;color:#8a8a84;margin-top:2px">No play this week.</div></td></tr>`;
      }
      const stat = (v: string, l: string) =>
        `<td style="padding-right:22px"><div style="font-size:20px;font-weight:700;color:#1a1a19">${v}</div>
          <div style="font-size:11px;color:#8a8a84;text-transform:uppercase;letter-spacing:.04em">${l}</div></td>`;
      const behind = k.behind.length
        ? `<div style="margin-top:10px;padding:9px 12px;background:#fdf0f0;border-left:3px solid #d03b3b;border-radius:0 6px 6px 0;font-size:13px;color:#5a5a56">
             <b style="color:#1a1a19">Below grade level:</b> ${k.behind
               .map((b) => `${esc(b.skill)} <span style="color:#8a8a84">(${b.by} tier${b.by === 1 ? '' : 's'} behind)</span>`)
               .join(', ')}
           </div>`
        : '';
      const ahead = k.ahead.length
        ? `<div style="margin-top:6px;font-size:13px;color:#5a5a56"><b style="color:#1a1a19">Ahead:</b> ${k.ahead
            .map((a) => `${esc(a.skill)} <span style="color:#8a8a84">(+${a.by})</span>`)
            .join(', ')}</div>`
        : '';
      const games = k.topGames.length
        ? `<div style="margin-top:6px;font-size:13px;color:#5a5a56"><b style="color:#1a1a19">Most played:</b> ${k.topGames
            .map((g) => `${esc(g.label)} <span style="color:#8a8a84">(${g.rounds})</span>`)
            .join(', ')}</div>`
        : `<div style="margin-top:6px;font-size:13px;color:#8a8a84">No game recorded — tracking began 26 July.</div>`;
      // Learning mix — the summary we lead with: a segmented bar (proportion) +
      // a counted, colored legend (identity, so it's never color-alone). Built
      // with table cells + bgcolor because that's the only bar an email client
      // reliably renders.
      const mixTotal = k.subjectMix.reduce((n, m) => n + m.rounds, 0);
      const mix =
        mixTotal > 0
          ? `<div style="margin-top:10px">
               <div style="font-size:11px;color:#8a8a84;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Learning mix</div>
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:5px;overflow:hidden"><tr>${k.subjectMix
                 .map(
                   (m) =>
                     `<td width="${Math.round((m.rounds / mixTotal) * 100)}%" style="background:${SUBJECT_META[m.subject].color};height:9px;font-size:0;line-height:9px">&nbsp;</td>`,
                 )
                 .join('')}</tr></table>
               <div style="font-size:13px;color:#5a5a56;margin-top:7px">${k.subjectMix
                 .map(
                   (m) =>
                     `<span style="white-space:nowrap;margin-right:14px"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${SUBJECT_META[m.subject].color}"></span> <b style="color:#1a1a19">${SUBJECT_META[m.subject].label}</b> <span style="color:#8a8a84">${m.rounds}</span></span>`,
                 )
                 .join('')}</div>
             </div>`
          : '';
      return `<tr><td style="padding:16px 0;border-top:1px solid #e6e6e2">
        <div style="font-size:16px;font-weight:700;color:#1a1a19;margin-bottom:8px">${esc(k.name)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${stat(String(k.rounds), 'rounds')}
          ${stat(`${k.minutes}m`, 'playing')}
          ${stat(String(k.activeDays), 'days')}
          ${k.finishedPct !== null ? stat(`${k.finishedPct}%`, 'finished') : ''}
        </tr></table>
        ${mix}${games}${ahead}${behind}
      </td></tr>`;
    })
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:26px 26px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <tr><td>
    <div style="font-size:12px;color:#8a8a84;text-transform:uppercase;letter-spacing:.06em">Gamecakes · week of ${esc(d.weekLabel)}</div>
    <div style="font-size:19px;font-weight:700;color:#1a1a19;line-height:1.35;margin-top:8px">${esc(d.headline)}</div>
    <div style="font-size:13px;color:#5a5a56;line-height:1.5;margin-top:6px">What we watch most is each kid&rsquo;s <b style="color:#1a1a19">learning mix</b> — how the week split across math, reading, and logic.</div>
  </td></tr>
  ${kidBlocks}
  <tr><td style="padding-top:18px">
    <a href="${esc(portalUrl)}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:999px">Open the parent portal</a>
  </td></tr>
  <tr><td style="padding-top:18px;border-top:1px solid #e6e6e2;margin-top:14px">
    <div style="font-size:11px;color:#8a8a84;line-height:1.6">
      A <b>round</b> is one play of a game, not one question. Gamecakes does not record per-question
      accuracy, so this report never claims any. <b>Finished</b> is the share of rounds played to the
      end rather than abandoned.<br><br>
      You are receiving this because this address was added in the Gamecakes parent portal.
      Remove it there to stop these emails.
    </div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}
