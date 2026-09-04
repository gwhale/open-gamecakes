// OpenRouter-based observation extractor.
//
// Given a photo (homework, writing sample, teacher report, etc.) and
// optional parent-written context, call an LLM with vision and return a
// structured extraction that pre-fills the parent observation form.
//
// We use OpenRouter (https://openrouter.ai/) rather than the Anthropic
// SDK directly because:
//   - One API key for all providers (Anthropic, OpenAI, Google, etc.)
//   - OpenAI-compatible request shape works identically across models
//   - If Claude mis-reads a particular handwriting style, swap to GPT-4o
//     or Gemini by changing MODEL below — no code change
//   - No SDK dependency; ~30 lines of fetch
//
// The response is constrained to a JSON schema so we can parse it reliably
// rather than hoping the model emits clean JSON. We prompt the model to
// emit ONLY a JSON object with specific fields and no surrounding prose.
// If parsing fails, we return a soft-fail with a raw text fallback that
// the parent can paste into the body field manually.
//
// Server-side only — uses OPENROUTER_API_KEY. Never import from a client
// component.

const MODEL = 'google/gemini-3.5-flash';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Skill slugs the extractor may suggest. Must match rows seeded in
 *  `skills` by migration 0003_seed_skills.sql. Kept in sync manually. */
const KNOWN_SKILL_SLUGS = [
  // math
  'counting-to-20',
  'add-within-10',
  'subtract-within-10',
  'add-within-20',
  'subtract-within-20',
  'skip-counting',
  'add-double-digit',
  'subtract-double-digit',
  'multiply-within-25',
  // reading
  'letter-sounds',
  'sight-words-kindergarten',
  'rhyming-words',
  'sight-words-first-grade',
  'simple-comprehension',
  'synonyms',
] as const;

export type ExtractedKind = 'note' | 'homework' | 'writing' | 'teacher_report';

export interface ExtractedObservation {
  /** What category the LLM thinks the artifact falls into. */
  kind: ExtractedKind;
  /** Short title suitable for the observation `title` field. */
  title: string;
  /** The observation body — what a parent would write. Paragraph-ish. */
  body: string;
  /** Closest matching skill slug from KNOWN_SKILL_SLUGS, or null if
   *  the LLM wasn't confident enough. */
  skillSlug: string | null;
  /** Subject (math | reading | null). */
  subject: 'math' | 'reading' | null;
  /** 0..1 confidence score reported by the model itself. */
  confidence: number;
}

export interface ExtractionResult {
  ok: true;
  extracted: ExtractedObservation;
  rawModelText: string;
  modelUsed: string;
}

export interface ExtractionFailure {
  ok: false;
  reason: string;
  rawModelText?: string;
}

/**
 * Call OpenRouter with a photo (as base64 data URL) and return a
 * structured extraction. The `parentPrompt` is optional free-text the
 * parent can add ("this is from today's math class, she was tired").
 *
 * This function does NOT throw on most error paths. It returns a
 * typed result so the caller (a route handler) can degrade gracefully.
 */
export async function extractObservationFromPhoto(args: {
  photoDataUrl: string; // "data:image/jpeg;base64,..."
  parentPrompt?: string;
  kidName?: string;
}): Promise<ExtractionResult | ExtractionFailure> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'OPENROUTER_API_KEY is not set' };
  }

  const systemPrompt = [
    'You are an assistant that helps parents log observations about their',
    'child\'s school learning. You will be shown an artifact (homework,',
    'writing sample, teacher note, or similar) and asked to produce a',
    'short structured observation the parent can review and save.',
    '',
    'You MUST respond with a single JSON object and NOTHING else. No prose',
    'before or after. No markdown code fences. No explanation.',
    '',
    'The JSON object must have exactly these fields:',
    '  "kind": one of "note" | "homework" | "writing" | "teacher_report"',
    '  "title": short (< 60 chars) title like "Friday math quiz"',
    '  "body": 1-3 sentence parent-voice description of what you see and',
    '          how the child did. Mention specific observations like',
    '          "got 8/10 correct" or "struggled with silent e". Avoid',
    '          judgmental language.',
    '  "skillSlug": closest match from this list, or null if unsure:',
    `    ${KNOWN_SKILL_SLUGS.join(', ')}`,
    '  "subject": "math" | "reading" | null',
    '  "confidence": number 0..1, your own confidence in the extraction',
  ].join('\n');

  const userText = [
    args.kidName ? `This is about a child named ${args.kidName}.` : null,
    args.parentPrompt ? `Parent says: "${args.parentPrompt}"` : null,
    'Here is the artifact:',
  ].filter(Boolean).join('\n');

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: args.photoDataUrl } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 500,
  };

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter recommends these two headers for telemetry / ranking.
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
    return { ok: false, reason: 'no content in response', rawModelText: JSON.stringify(json).slice(0, 500) };
  }

  const parsed = parseExtraction(content);
  if (!parsed) {
    return {
      ok: false,
      reason: 'could not parse model output as structured extraction',
      rawModelText: content,
    };
  }

  return { ok: true, extracted: parsed, rawModelText: content, modelUsed: MODEL };
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
  // Some models return content as an array of content parts.
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

function parseExtraction(content: string): ExtractedObservation | null {
  // The model MAY wrap JSON in a fence or add stray text despite our
  // instructions. Try to find a JSON object inside the string as a
  // fallback before giving up.
  let jsonText = content.trim();
  if (jsonText.startsWith('```')) {
    // Strip fences
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  // Look for the first `{` and last `}` as a heuristic.
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

  const kind = normalizeKind(r.kind);
  const title = typeof r.title === 'string' ? r.title.slice(0, 120) : '';
  const bodyText = typeof r.body === 'string' ? r.body : '';
  const skillSlug = normalizeSkillSlug(r.skillSlug);
  const subject = normalizeSubject(r.subject);
  const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence)
    ? Math.max(0, Math.min(1, r.confidence))
    : 0.5;

  if (!kind || !bodyText) return null;

  return { kind, title, body: bodyText, skillSlug, subject, confidence };
}

function normalizeKind(v: unknown): ExtractedKind | null {
  if (v === 'note' || v === 'homework' || v === 'writing' || v === 'teacher_report') return v;
  return null;
}

function normalizeSkillSlug(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if ((KNOWN_SKILL_SLUGS as readonly string[]).includes(v)) return v;
  return null;
}

function normalizeSubject(v: unknown): 'math' | 'reading' | null {
  if (v === 'math' || v === 'reading') return v;
  return null;
}
