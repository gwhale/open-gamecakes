'use client';

// Per-kid observation panel for the parent dashboard.
//
// Renders:
//   1. Recent observations (read-only list, pre-fetched server-side)
//   2. "Upload photo" button that POSTs a file to /api/observations/upload,
//      which returns an AI-extracted {kind, title, body, skillSlug,
//      subject, confidence} structure
//   3. "Add observation" form with controlled inputs that can be
//      pre-filled from the extraction above. The form submits to
//      /api/observations via standard HTML POST (not fetch) — the
//      server-side save path stays unchanged, with the existing 303
//      redirect back to /parent. So the save flow doesn't depend on
//      JavaScript being happy.
//
// Why a client component at all: we need JS for the upload flow (fetch,
// spinner, state-updating the form on response). The form submit itself
// doesn't need JS, but since we're already here we might as well use
// React state for controlled inputs so pre-fill is trivial.

import { useCallback, useId, useRef, useState } from 'react';
import type { Kid, Skill, Observation, ObservationKind } from '@/lib/types';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import { coerceCupcakeConfig } from '@/lib/cupcake/config';

interface ExtractedObservation {
  kind: ObservationKind;
  title: string;
  body: string;
  skillSlug: string | null;
  subject: 'math' | 'reading' | null;
  confidence: number;
}

interface UploadResponseOk {
  ok: true;
  photoPath: string;
  signedUrl: string | null;
  extracted: ExtractedObservation;
  modelUsed: string;
}

interface UploadResponseErr {
  ok: false;
  error: string;
  photoPath?: string;
  signedUrl?: string | null;
  rawModelText?: string | null;
}

const OBSERVATION_KINDS: { value: ObservationKind; label: string }[] = [
  { value: 'note',           label: 'Note'            },
  { value: 'homework',       label: 'Homework'        },
  { value: 'writing',        label: 'Writing sample'  },
  { value: 'teacher_report', label: 'Teacher report'  },
];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const delta = Math.floor((now - d.getTime()) / 1000);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function KidObservationSection({
  kid,
  observations,
  skills,
  skillsById,
}: {
  kid: Kid;
  observations: Observation[];
  skills: Skill[];
  skillsById: Record<string, Skill>;
}) {
  // ---- controlled form state ----
  const [kind, setKind] = useState<ObservationKind>('note');
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [skillId, setSkillId] = useState<string>('');
  const [calibratedTier, setCalibratedTier] = useState<string>('');

  // Which fields came from AI (for the "AI-assisted" badge)
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [confidence, setConfidence] = useState<number | null>(null);

  // ---- upload state ----
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileInputId = useId();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kidId', kid.id);
      if (body.trim()) fd.append('prompt', body.trim());

      const res = await fetch('/api/observations/upload', { method: 'POST', body: fd });
      const data = (await res.json()) as UploadResponseOk | UploadResponseErr;

      if (!res.ok) {
        setUploadError(
          'error' in data && data.error
            ? `Upload failed: ${data.error}`
            : `Upload failed: HTTP ${res.status}`,
        );
        return;
      }

      // Always remember photoPath and signedUrl if we got them.
      if ('photoPath' in data && data.photoPath) setPhotoPath(data.photoPath);
      if ('signedUrl' in data && data.signedUrl) setSignedUrl(data.signedUrl);

      if (!data.ok) {
        setUploadError(`AI extraction didn\u2019t work: ${data.error}. You can fill the form in manually.`);
        return;
      }

      // Pre-fill form from extraction
      const ex = data.extracted;
      setKind(ex.kind);
      setTitle(ex.title);
      setBody(ex.body);
      // Look up skill by slug → id for the select
      const matchedSkill = skills.find((s) => s.name === ex.skillSlug && (ex.subject === null || s.subject === ex.subject));
      setSkillId(matchedSkill?.id ?? '');
      setCalibratedTier('');
      setAiFilled(new Set(['kind', 'title', 'body', ...(matchedSkill ? ['skillId'] : [])]));
      setConfidence(ex.confidence);
    } catch (err) {
      setUploadError(`Upload failed: ${String(err)}`);
    } finally {
      setUploading(false);
      // Reset the file input so the same file can be re-selected.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [kid.id, body, skills]);

  // Clear AI markers when the user edits fields manually
  const markEdited = useCallback((field: string) => {
    setAiFilled((s) => {
      if (!s.has(field)) return s;
      const next = new Set(s);
      next.delete(field);
      return next;
    });
  }, []);

  const showAiBadge = (field: string) =>
    aiFilled.has(field) ? (
      <span className="ml-2 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-900 dark:bg-violet-950 dark:text-violet-200">
        ✨ AI
      </span>
    ) : null;

  return (
    <section className="rounded-3xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex items-center gap-4">
        <CupcakeAvatar
          config={coerceCupcakeConfig(kid.cupcake_config)}
          size={48}
        />
        <h2 className="text-2xl font-semibold">{kid.name}</h2>
      </div>

      {/* Existing observations */}
      <div className="mt-5">
        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Recent observations
        </h3>
        {observations.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No observations yet. Add the first one below.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {observations.map((o) => {
              const skill = o.skill_id ? skillsById[o.skill_id] : undefined;
              return (
                <li
                  key={o.id}
                  className="rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      <span className="font-medium uppercase tracking-wider">
                        {o.kind.replace('_', ' ')}
                      </span>
                      {skill ? <> · <span>{skill.display_name}</span></> : null}
                      {o.calibrated_tier !== null ? (
                        <>
                          {' · '}
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            calibrated to tier {o.calibrated_tier}
                          </span>
                        </>
                      ) : null}
                    </span>
                    <span>{formatWhen(o.created_at)}</span>
                  </div>
                  {o.title ? <div className="mt-1 font-semibold">{o.title}</div> : null}
                  <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {o.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Upload box */}
      <div className="mt-6 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-violet-900 dark:text-violet-200">
              ✨ Upload a photo
            </div>
            <div className="text-xs text-violet-700 dark:text-violet-300">
              Homework, writing sample, or a teacher note. AI will fill the form for you to review.
            </div>
          </div>
          <div>
            <label
              htmlFor={fileInputId}
              className={`cursor-pointer rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 active:scale-95 ${uploading ? 'opacity-50' : ''}`}
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              {uploading ? 'Uploading…' : 'Choose photo'}
            </label>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>
        </div>
        {uploadError ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{uploadError}</p>
        ) : null}
        {signedUrl && !uploadError ? (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt="uploaded artifact"
              className="max-h-40 w-auto rounded-lg border border-violet-200 dark:border-violet-800"
            />
          </div>
        ) : null}
        {confidence !== null ? (
          <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
            AI confidence: {Math.round(confidence * 100)}% — review carefully and edit before saving.
          </p>
        ) : null}
      </div>

      {/* Add observation form — controlled, submits via standard HTML POST */}
      <form
        action="/api/observations"
        method="post"
        className="mt-6 flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800"
      >
        <input type="hidden" name="kidId" value={kid.id} />

        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Add observation
        </h3>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Kind{showAiBadge('kind')}
          </span>
          <select
            name="kind"
            value={kind}
            onChange={(e) => { setKind(e.target.value as ObservationKind); markEdited('kind'); }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {OBSERVATION_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Title (optional){showAiBadge('title')}
          </span>
          <input
            type="text"
            name="title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); markEdited('title'); }}
            placeholder="e.g. Friday math quiz"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            What did you observe?{showAiBadge('body')}
          </span>
          <textarea
            name="body"
            value={body}
            onChange={(e) => { setBody(e.target.value); markEdited('body'); }}
            required
            rows={4}
            placeholder={`${kid.name} got 8/10 on subtraction with regrouping…`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Related skill (optional){showAiBadge('skillId')}
          </span>
          <select
            name="skillId"
            value={skillId}
            onChange={(e) => { setSkillId(e.target.value); markEdited('skillId'); }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            <option value="">— none —</option>
            <optgroup label="Math">
              {skills.filter((s) => s.subject === 'math').map((s) => (
                <option key={s.id} value={s.id}>{s.display_name}</option>
              ))}
            </optgroup>
            <optgroup label="Reading">
              {skills.filter((s) => s.subject === 'reading').map((s) => (
                <option key={s.id} value={s.id}>{s.display_name}</option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Calibrate this skill to tier (optional — only with a skill selected)
          </span>
          <input
            type="number"
            name="calibratedTier"
            min={1}
            max={10}
            value={calibratedTier}
            onChange={(e) => setCalibratedTier(e.target.value)}
            placeholder="1–10"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Setting this directly updates {kid.name}&rsquo;s current tier for the chosen skill and
            resets the rolling mastery window.
          </span>
        </label>

        {/* Hidden: photo path so the server knows to include it in metadata */}
        {photoPath ? <input type="hidden" name="photoPath" value={photoPath} /> : null}

        <div>
          <button
            type="submit"
            className="mt-2 rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white hover:bg-zinc-800 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Save observation
          </button>
        </div>
      </form>
    </section>
  );
}
