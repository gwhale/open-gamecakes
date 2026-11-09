// How much Gamecakes is being used, from the answers kids give in games.
// Pure, like overview.ts, so the arithmetic can be tested without a database.
//
// Every answer is one `attempts` row. That is the only usage record there is:
// no AI spend or page-view table exists, so this is play, not cost.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Days in the chart, today included. */
export const USAGE_DAYS = 30;
/** One answer counts for at most this long toward "minutes playing". A kid who
 *  walks away mid-question would otherwise add an hour to the total. */
export const ANSWER_TIME_CAP_MS = 2 * MINUTE;
/** Days are cut in George's time zone, not UTC, so an evening's play is one day. */
export const USAGE_TIME_ZONE = 'America/New_York';

export interface UsageAnswerInput {
  kid_id: string;
  created_at: string;
  correct?: boolean | null;
  response_time_ms?: number | null;
}

export interface UsageDay {
  /** YYYY-MM-DD in USAGE_TIME_ZONE. */
  date: string;
  answers: number;
  /** Kids who answered at least once that day. */
  kids: number;
}

export interface FamilyUsage {
  id: string;
  name: string;
  /** Days with at least one answer, last 30. */
  activeDays: number;
  activeKids: number;
  answers: number;
  /** Share of answers right, 0..1, or null with no answers. */
  accuracy: number | null;
  minutes: number;
}

export interface Usage {
  days: UsageDay[];
  totals: {
    answers7d: number;
    answers30d: number;
    activeKids7d: number;
    activeKids30d: number;
    activeFamilies30d: number;
    minutes30d: number;
    accuracy30d: number | null;
  };
  /** Most answers first. Families with none come last, newest-named order kept stable. */
  families: FamilyUsage[];
}

const dayKey = (() => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: USAGE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (ms: number): string => fmt.format(new Date(ms));
})();

export function buildUsage(input: {
  answers: UsageAnswerInput[];
  kids: { id: string; family_id: string }[];
  families: { id: string; name: string }[];
  now: Date;
}): Usage {
  const { answers, kids, families, now } = input;
  const familyOf = new Map(kids.map((k) => [k.id, k.family_id]));
  const nowMs = now.getTime();

  const days: UsageDay[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = USAGE_DAYS - 1; i >= 0; i -= 1) {
    const date = dayKey(nowMs - i * DAY);
    if (dayIndex.has(date)) continue; // a DST day can repeat a key
    dayIndex.set(date, days.length);
    days.push({ date, answers: 0, kids: 0 });
  }
  const kidsPerDay = days.map(() => new Set<string>());

  const per = new Map<string, { days: Set<string>; kids: Set<string>; answers: number; right: number; ms: number }>();
  const kids7 = new Set<string>();
  const kids30 = new Set<string>();
  let answers7d = 0;
  let answers30d = 0;
  let right30 = 0;
  let ms30 = 0;

  for (const a of answers) {
    const at = Date.parse(a.created_at);
    if (!Number.isFinite(at) || nowMs - at > USAGE_DAYS * DAY || at > nowMs) continue;
    const date = dayKey(at);
    const idx = dayIndex.get(date);
    if (idx === undefined) continue;
    const ms = Math.min(Math.max(a.response_time_ms ?? 0, 0), ANSWER_TIME_CAP_MS);

    days[idx].answers += 1;
    kidsPerDay[idx].add(a.kid_id);
    answers30d += 1;
    kids30.add(a.kid_id);
    if (a.correct) right30 += 1;
    ms30 += ms;
    if (nowMs - at <= 7 * DAY) {
      answers7d += 1;
      kids7.add(a.kid_id);
    }

    const fam = familyOf.get(a.kid_id);
    if (!fam) continue;
    let f = per.get(fam);
    if (!f) {
      f = { days: new Set(), kids: new Set(), answers: 0, right: 0, ms: 0 };
      per.set(fam, f);
    }
    f.days.add(date);
    f.kids.add(a.kid_id);
    f.answers += 1;
    if (a.correct) f.right += 1;
    f.ms += ms;
  }
  days.forEach((d, i) => {
    d.kids = kidsPerDay[i].size;
  });

  const familyRows: FamilyUsage[] = families.map((fam) => {
    const f = per.get(fam.id);
    return {
      id: fam.id,
      name: fam.name,
      activeDays: f?.days.size ?? 0,
      activeKids: f?.kids.size ?? 0,
      answers: f?.answers ?? 0,
      accuracy: f && f.answers > 0 ? f.right / f.answers : null,
      minutes: Math.round((f?.ms ?? 0) / MINUTE),
    };
  });
  familyRows.sort((a, b) => b.answers - a.answers);

  return {
    days,
    totals: {
      answers7d,
      answers30d,
      activeKids7d: kids7.size,
      activeKids30d: kids30.size,
      activeFamilies30d: per.size,
      minutes30d: Math.round(ms30 / MINUTE),
      accuracy30d: answers30d > 0 ? right30 / answers30d : null,
    },
    families: familyRows,
  };
}
