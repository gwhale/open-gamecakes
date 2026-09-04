// AI feedback summarizer — turns a kid's voice/text feedback into a
// structured ticket (bug / feature / feedback).
//
// Two modes:
//   1. Text-only: kid typed their feedback → classify + summarize via
//      Claude on OpenRouter (fast, reliable, same model as observations)
//   2. Audio: kid recorded a voice note → try Gemini via OpenRouter for
//      combined transcription + classification. If that fails, return
//      fallbackToText so the UI can ask for typed input instead.
//
// Same soft-fail pattern as observation-extract.ts.

const TEXT_MODEL = 'google/gemini-3.5-flash';
const AUDIO_MODEL = 'google/gemini-3.5-flash';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface FeedbackTicket {
  transcript: string;
  ticketType: 'bug' | 'feature' | 'feedback';
  title: string;
  summary: string;
}

export interface SummarizeResult {
  ok: true;
  ticket: FeedbackTicket;
  rawModelText: string;
}

export interface SummarizeFailure {
  ok: false;
  reason: string;
  fallbackToText?: boolean;
}

function systemPrompt(gameSlug: string, kidName?: string): string {
  return [
    `You are helping a kid${kidName ? ` named ${kidName}` : ''} articulate product feedback for a game.`,
    `The game is called "${gameSlug}" in the Gamecakes app.`,
    '',
    'From their voice note or typed text, produce a JSON object with NOTHING else:',
    '{',
    '  "transcript": "cleaned-up version of what they said (fix grammar gently but keep their voice)",',
    '  "ticketType": "bug" | "feature" | "feedback",',
    '  "title": "short ticket title, under 60 chars",',
    '  "summary": "1-2 sentence description. Kid-friendly, encouraging language."',
    '}',
    '',
    'Classify as:',
    '- "bug" if something is broken, wrong, glitchy, or doesn\'t work right',
    '- "feature" if they want something new, different, or added',
    '- "feedback" if it\'s a general opinion, suggestion, or feeling about the game',
    '',
    'Keep the language encouraging — this kid is learning to give product feedback.',
  ].join('\n');
}

/**
 * Summarize TEXT feedback from a kid into a structured ticket.
 */
export async function summarizeTextFeedback(args: {
  text: string;
  gameSlug: string;
  kidName?: string;
}): Promise<SummarizeResult | SummarizeFailure> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, reason: 'OPENROUTER_API_KEY is not set' };

  const body = {
    model: TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt(args.gameSlug, args.kidName) },
      { role: 'user', content: args.text },
    ],
    temperature: 0.3,
    max_tokens: 600,
    // Force a pure-JSON reply so parsing is reliable across model versions.
    response_format: { type: 'json_object' as const },
  };

  return callOpenRouter(body, apiKey);
}

/**
 * Transcribe + summarize AUDIO feedback. Uses Gemini which supports
 * audio input. If the model can't process audio, returns fallbackToText.
 */
export async function summarizeAudioFeedback(args: {
  audioDataUrl: string; // "data:audio/mp4;base64,..."
  gameSlug: string;
  kidName?: string;
  /** Audio container/codec, derived from the recorded MIME (e.g. 'm4a',
   *  'webm', 'wav'). Must match the bytes — the old hardcoded 'mp3' meant
   *  Gemini was handed mp4/webm bytes labelled mp3 and couldn't decode them. */
  format?: string;
}): Promise<SummarizeResult | SummarizeFailure> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, reason: 'OPENROUTER_API_KEY is not set' };

  const body = {
    model: AUDIO_MODEL,
    messages: [
      { role: 'system', content: systemPrompt(args.gameSlug, args.kidName) },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Here is a voice note from a kid about the game. Transcribe what they said and create a feedback ticket.',
          },
          {
            type: 'input_audio',
            input_audio: { data: args.audioDataUrl.replace(/^data:[^;]+;base64,/, ''), format: args.format ?? 'mp3' },
          },
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: 700,
    response_format: { type: 'json_object' as const },
  };

  const result = await callOpenRouter(body, apiKey);

  // If the audio model fails, suggest text fallback
  if (!result.ok) {
    return { ...result, fallbackToText: true };
  }
  return result;
}

export interface TranscribeResult {
  ok: true;
  transcript: string;
}

/**
 * Transcribe AUDIO to plain text — NO ticket classification/rewrite.
 *
 * This is the robust "voice to text" path: the kid's words come back verbatim
 * so they can review/edit them in the textarea and send as-is. We deliberately
 * skip the JSON ticket schema (title/summary/type) because that AI rewrite was
 * brittle — a slightly-off reply broke the whole submission. Plain text can't
 * "fail to parse."
 */
export async function transcribeAudio(args: {
  audioDataUrl: string;
  format?: string;
}): Promise<TranscribeResult | SummarizeFailure> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, reason: 'OPENROUTER_API_KEY is not set', fallbackToText: true };

  const body = {
    model: AUDIO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You transcribe a kid’s short voice note about a game. Output ONLY the exact words they said, as plain text. No quotes, no labels, no commentary, no JSON — just the transcription.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this voice note.' },
          {
            type: 'input_audio',
            input_audio: { data: args.audioDataUrl.replace(/^data:[^;]+;base64,/, ''), format: args.format ?? 'mp3' },
          },
        ],
      },
    ],
    temperature: 0,
    // gemini-3.5-flash is a reasoning model and reasoning is MANDATORY on this
    // endpoint (it can't be disabled). Left uncapped, the mandatory "thinking"
    // ate the whole token budget and the reply came back with content === null
    // → "no transcript" → every voice note failed. Cap reasoning low and give
    // the transcript generous headroom so the words always land in `content`.
    reasoning: { max_tokens: 64 },
    max_tokens: 1200,
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
    return { ok: false, reason: `network error: ${String(err)}`, fallbackToText: true };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 300)}`, fallbackToText: true };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: 'response was not valid JSON', fallbackToText: true };
  }

  const content = extractContent(json);
  const transcript = content?.trim();
  if (!transcript) return { ok: false, reason: 'no transcript in response', fallbackToText: true };

  return { ok: true, transcript };
}

async function callOpenRouter(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<SummarizeResult | SummarizeFailure> {
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

  const ticket = parseTicket(content);
  if (!ticket) {
    return { ok: false, reason: 'could not parse ticket from model output' };
  }

  return { ok: true, ticket, rawModelText: content };
}

function extractContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const choices = (json as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const msg = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof msg?.content === 'string') return msg.content;
  if (Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function parseTicket(content: string): FeedbackTicket | null {
  let text = content.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const transcript = typeof raw.transcript === 'string' ? raw.transcript.trim() : '';
  // Accept `type` as an alias for `ticketType`, and default to 'feedback' so a
  // slightly-off reply still produces a usable ticket instead of hard-failing.
  const ticketType = normalizeType(raw.ticketType) ?? normalizeType(raw.type) ?? 'feedback';
  let title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
  let summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

  // Cross-fill from whatever we got; only fail when there's truly nothing.
  if (!title) title = summary.slice(0, 60) || transcript.slice(0, 60);
  if (!summary) summary = title || transcript;
  if (!title && !summary && !transcript) return null;

  return { transcript: transcript || title, ticketType, title: title || 'Feedback', summary: summary || title };
}

function normalizeType(v: unknown): 'bug' | 'feature' | 'feedback' | null {
  if (v === 'bug' || v === 'feature' || v === 'feedback') return v;
  return null;
}
