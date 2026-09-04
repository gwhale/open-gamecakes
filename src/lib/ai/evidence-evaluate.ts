// Evidence evaluator — multi-skill AI assessment.
//
// Given a learning artifact (photo, text, or game-session summary) plus the
// live skills catalog and the kid's current tier state, return an array of
// verdicts across ANY skills the model sees evidence for. Matches existing
// observation-extract.ts patterns: Gemini 3.5 Flash via OpenRouter, low
// temperature, JSON-only output with fence-strip recovery, soft-fail shape.
//
// The evaluator does NOT write to the database. It returns pure data. The
// route handler is responsible for persisting the event + applying verdicts
// via the weighted translator in `src/lib/evidence/apply.ts`.
//
// Design note: we pass the FULL skills catalog (62 rows) in the prompt so
// the model can reason about the whole standards framework at once. At
// ~80 tokens per skill row, this is ~5k tokens — well within budget for
// Gemini 3.5 Flash. Filtering catalog-side would risk the model missing
// cross-domain signals (e.g. a long-division photo also exercising
// place-value).
//
// Server-side only — uses OPENROUTER_API_KEY. Never import from a client.

import type { Skill, Verdict } from '@/lib/types';

const MODEL = 'google/gemini-3.5-flash';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface KidContextRow {
  skillSlug: string;
  currentTier: number;
  masteryPct: number;
}

export interface EvaluationInput {
  /** 'photo' attaches an image. 'text' sends just text. 'game_session'
   *  sends a summary object rendered as text. */
  artifactType: 'photo' | 'text' | 'game_session';
  /** For photo artifacts — full data URL. */
  photoDataUrl?: string;
  /** For text / game_session artifacts — the raw text or JSON-stringified summary. */
  text?: string;
  /** Optional parent note adding context. */
  parentPrompt?: string;
  kidName?: string;
  kidGrade?: string; // e.g. "K", "2"
  /** Kid's current tier/mastery state for skills they've touched. */
  kidContext: KidContextRow[];
  /** The skills catalog to evaluate against. Caller loads this from DB. */
  skills: Pick<
    Skill,
    'name' | 'display_name' | 'subject' | 'standard_code' | 'grade_level' | 'on_track_tier' | 'domain'
  >[];
  /** If the caller knows the game session already updated a specific
   *  skill via /api/attempts, pass it here so the evaluator can focus on
   *  SECONDARY skills and not double-count. */
  primarySkillSlug?: string;
}

export interface EvaluatedVerdict {
  skillSlug: string;
  verdict: Verdict;
  /** 0..1 — model's self-reported confidence. */
  confidence: number;
  reasoning: string;
}

export interface EvaluationResult {
  ok: true;
  verdicts: EvaluatedVerdict[];
  summary: string;
  rawModelText: string;
  modelUsed: string;
}

export interface EvaluationFailure {
  ok: false;
  reason: string;
  rawModelText?: string;
}

export async function evaluateEvidence(
  input: EvaluationInput,
): Promise<EvaluationResult | EvaluationFailure> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, reason: 'OPENROUTER_API_KEY is not set' };

  const systemPrompt = buildSystemPrompt(input);
  const userMessages = buildUserMessages(input);

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...userMessages,
    ],
    temperature: 0.2,
    max_tokens: 1500,
  };

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gamecakes.org',
        'X-Title': 'Gamecakes',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `network error: ${String(err)}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: 'response was not valid JSON' };
  }

  const content = extractContent(json);
  if (!content) {
    return { ok: false, reason: 'no content in response' };
  }

  const parsed = parseEvaluation(content, input.skills);
  if (!parsed) {
    return {
      ok: false,
      reason: 'could not parse evaluator output',
      rawModelText: content.slice(0, 500),
    };
  }

  return { ok: true, ...parsed, rawModelText: content, modelUsed: MODEL };
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildSystemPrompt(input: EvaluationInput): string {
  const catalog = input.skills.map((s) => {
    const parts = [
      `  - ${s.name}`,
      `    name: ${s.display_name}`,
      `    subject: ${s.subject}`,
      s.standard_code ? `    CCSS: ${s.standard_code}` : null,
      s.grade_level ? `    grade: ${s.grade_level}` : null,
      s.on_track_tier ? `    on-track tier: ${s.on_track_tier}` : null,
      s.domain ? `    domain: ${s.domain}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n');

  return [
    'You are an evidence evaluator for a K-6 learning app. A parent or the',
    "system has captured an artifact of a child's learning — a homework photo,",
    'a parent note, or a game-session summary. Your job is to look at the',
    'artifact and report what CCSS skills it gives evidence for, positively',
    'or negatively.',
    '',
    'You MUST respond with a single JSON object and NOTHING else. No prose,',
    'no code fences, no markdown. The object has exactly two fields:',
    '',
    '  "summary": one short sentence describing what you observed overall.',
    '',
    '  "verdicts": an array of objects. Include ONLY skills you actually saw',
    '  evidence for. Do NOT include every skill in the catalog — only the',
    '  ones relevant to this artifact. Usually 1-4 verdicts per artifact.',
    '',
    '  Each verdict has:',
    '    "skillSlug": must match one of the skill names in the catalog below',
    '    "verdict": one of:',
    '       "correct"       — clear evidence the child CAN do this skill',
    '       "partial"       — partial/inconsistent — got some, missed some',
    '       "incorrect"     — clear evidence they STRUGGLED with this skill',
    '       "not-evidenced" — (skip this — only include skills with real signal)',
    '    "confidence": 0..1 — how sure you are of this verdict',
    '    "reasoning": one sentence explaining what in the artifact led to this',
    '',
    'Guidance:',
    '  - Evidence is NOT proof of mastery — a single photo showing correct',
    '    counting to 20 is confidence ~0.4, not 1.0. Multiple confirmations',
    "    accumulate over time. Don't overrate single observations.",
    '  - If the artifact exercises multiple skills (e.g. long division uses',
    '    place-value + operations + maybe fractions), emit verdicts for ALL',
    '    of them with appropriate confidence each.',
    '  - Grade context matters: a K-age child writing their name correctly',
    "    is evidence for letter-sounds, but isn't evidence for anything in",
    '    the 3rd-grade catalog. Do not stretch.',
    input.primarySkillSlug
      ? `  - The skill "${input.primarySkillSlug}" was ALREADY updated by the`
        + ' caller. Do NOT emit a verdict for it — focus only on SECONDARY'
        + ' skills this artifact also exercises.'
      : null,
    '',
    'SKILLS CATALOG:',
    catalog,
  ].filter(Boolean).join('\n');
}

function buildUserMessages(input: EvaluationInput): Array<{ role: 'user'; content: unknown }> {
  const textLines: string[] = [];
  if (input.kidName) textLines.push(`Child: ${input.kidName}${input.kidGrade ? ` (grade ${input.kidGrade})` : ''}`);
  if (input.kidContext.length > 0) {
    textLines.push('Current tiers (skills they have practiced):');
    for (const c of input.kidContext) {
      textLines.push(`  ${c.skillSlug}: tier ${c.currentTier}, mastery ${Math.round(c.masteryPct * 100)}%`);
    }
  }
  if (input.parentPrompt) textLines.push(`Parent context: "${input.parentPrompt}"`);
  textLines.push(`Artifact type: ${input.artifactType}`);

  if (input.artifactType === 'photo' && input.photoDataUrl) {
    textLines.push('The artifact is attached as an image.');
    return [{
      role: 'user',
      content: [
        { type: 'text', text: textLines.join('\n') },
        { type: 'image_url', image_url: { url: input.photoDataUrl } },
      ],
    }];
  }

  // text / game_session
  textLines.push('Artifact:');
  textLines.push(input.text ?? '(empty)');
  return [{ role: 'user', content: textLines.join('\n') }];
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function extractContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const msg = (choices[0] as { message?: { content?: unknown } }).message;
  const content = msg?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object' && 'text' in part) {
        const t = (part as { text?: unknown }).text;
        if (typeof t === 'string') return t;
      }
    }
  }
  return null;
}

function parseEvaluation(
  content: string,
  skills: EvaluationInput['skills'],
): { verdicts: EvaluatedVerdict[]; summary: string } | null {
  let jsonText = content.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  jsonText = jsonText.slice(start, end + 1);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const summary = typeof r.summary === 'string' ? r.summary.slice(0, 400) : '';
  const rawVerdicts = Array.isArray(r.verdicts) ? r.verdicts : [];
  const validSlugs = new Set(skills.map((s) => s.name));

  const verdicts: EvaluatedVerdict[] = [];
  for (const v of rawVerdicts) {
    if (!v || typeof v !== 'object') continue;
    const vv = v as Record<string, unknown>;
    const skillSlug = typeof vv.skillSlug === 'string' ? vv.skillSlug : null;
    if (!skillSlug || !validSlugs.has(skillSlug)) continue;

    const verdict = normalizeVerdict(vv.verdict);
    if (!verdict || verdict === 'not-evidenced') continue;

    const confidence = typeof vv.confidence === 'number' && Number.isFinite(vv.confidence)
      ? Math.max(0, Math.min(1, vv.confidence))
      : 0.5;

    const reasoning = typeof vv.reasoning === 'string' ? vv.reasoning.slice(0, 300) : '';

    verdicts.push({ skillSlug, verdict, confidence, reasoning });
  }

  return { verdicts, summary };
}

function normalizeVerdict(v: unknown): Verdict | null {
  if (v === 'correct' || v === 'partial' || v === 'incorrect' || v === 'not-evidenced') return v;
  return null;
}
