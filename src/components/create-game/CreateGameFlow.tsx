'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import GamecakesLogo from '@/components/GamecakesLogo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'intro' | 'name' | 'describe' | 'draw' | 'sending' | 'sent';
type DrawTool = 'pencil' | 'eraser';

interface CreateGameFlowProps {
  kidName: string;
  avatar: string;
}

// ---------------------------------------------------------------------------
// Drawing palette — brand colors + basics
// ---------------------------------------------------------------------------

const PALETTE = [
  '#1f2937', // near-black
  '#dc2626', // cherry
  '#fb7185', // strawberry
  '#f97316', // orange
  '#fbbf24', // amber
  '#6ee7b7', // mint
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f9a8d4', // pink
  '#ffffff',  // white
];

const CANVAS_W = 400;
const CANVAS_H = 280;

// ---------------------------------------------------------------------------
// Cakey speech per phase
// ---------------------------------------------------------------------------

const CAKEY_LINES: Record<Phase, string> = {
  intro:    "Let's build a game together! Tell me your idea and I'll save it for later. 🎮",
  name:     "Every great game needs a name. What should we call yours?",
  describe: "Tell me what you DO in the game! How do you win? Any characters?",
  draw:     "Now draw what it looks like! Even a quick sketch helps! 🖍️",
  sending:  "Sending your idea now...",
  sent:     "WOW! That sounds SO fun! I sent your idea — a grown-up will look at it soon! 🎉",
};

const CAKEY_MOODS: Record<Phase, CakeyMood> = {
  intro:    'wave',
  name:     'happy',
  describe: 'happy',
  draw:     'wave',
  sending:  'idle',
  sent:     'celebrate',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateGameFlow({ kidName, avatar }: CreateGameFlowProps) {
  const [phase, setPhase]       = useState<Phase>('intro');
  const [gameName, setGameName] = useState('');
  const [gameDesc, setGameDesc] = useState('');
  const [error, setError]       = useState('');

  // Canvas drawing state
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef<{ x: number; y: number } | null>(null);
  const hasDrawn   = useRef(false);
  const [color, setColor]      = useState('#1f2937');
  const [tool, setTool]        = useState<DrawTool>('pencil');
  const [thickness, setThickness] = useState(5);

  // White canvas background on mount (and whenever draw phase activates)
  useEffect(() => {
    if (phase !== 'draw') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Only initialise on first entry to avoid clearing in-progress art
    if (!hasDrawn.current) {
      ctx.fillStyle = '#fffbf0';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }, [phase]);

  // Canvas coordinate helper — maps screen pos to canvas pixel pos
  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    hasDrawn.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    const ctx = canvasRef.current!.getContext('2d')!;
    const effectiveColor = tool === 'eraser' ? '#fffbf0' : color;
    const effectiveWidth = tool === 'eraser' ? thickness * 4 : thickness;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, effectiveWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = effectiveColor;
    ctx.fill();
  }, [color, tool, thickness]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPos.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    const effectiveColor = tool === 'eraser' ? '#fffbf0' : color;
    const effectiveWidth = tool === 'eraser' ? thickness * 4 : thickness;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = effectiveColor;
    ctx.lineWidth = effectiveWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, [color, tool, thickness]);

  const onPointerUp = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  function clearCanvas() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fffbf0';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    hasDrawn.current = false;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function submit(skipDrawing: boolean) {
    setPhase('sending');
    setError('');

    let drawingPath: string | null = null;

    // Upload drawing if the kid actually drew something
    if (!skipDrawing && hasDrawn.current && canvasRef.current) {
      try {
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        const res = await fetch('/api/game-ideas/upload-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        if (res.ok) {
          const json = (await res.json()) as { path?: string };
          drawingPath = json.path ?? null;
        }
      } catch {
        // Drawing upload failure is non-fatal — continue without it
      }
    }

    // Save the ticket
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketType: 'feature',
        gameSlug: 'game-idea',
        title: gameName.trim(),
        transcript: gameDesc.trim(),
        summary: `Game idea from ${kidName}: "${gameName.trim()}" — ${gameDesc.trim().slice(0, 120)}${gameDesc.length > 120 ? '…' : ''}`,
        drawingPath,
      }),
    });

    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Something went wrong. Try again!');
      setPhase('draw');
      return;
    }

    setPhase('sent');
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const mood = CAKEY_MOODS[phase];
  const line = CAKEY_LINES[phase];

  const nameOk = gameName.trim().length >= 2;
  const descOk = gameDesc.trim().length >= 10;

  // Step indicator (1-based, excludes intro/sending/sent)
  const STEPS: Phase[] = ['name', 'describe', 'draw'];
  const stepNum = STEPS.indexOf(phase) + 1; // 0 if not in steps

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-violet-50 via-amber-50 to-rose-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">

      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={36} />
          <span className="text-lg font-bold text-violet-900 dark:text-violet-200">
            Invent a Game
          </span>
        </div>
        {phase !== 'sent' && (
          <Link
            href="/town"
            className="rounded-full bg-white/60 px-4 py-1.5 text-sm font-medium text-zinc-600 backdrop-blur-sm transition hover:bg-white/90 dark:bg-zinc-800/60 dark:text-zinc-300"
          >
            ← Back
          </Link>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-start gap-6 px-4 pb-10 sm:flex-row sm:items-start sm:justify-center sm:gap-10 sm:pt-6">

        {/* Cakey column */}
        <div className="flex flex-col items-center gap-3 sm:sticky sm:top-8 sm:w-40">
          <GamecakesMascot mood={mood} size={110} />
          <div className="relative rounded-3xl rounded-tl-md bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-800 shadow-md dark:bg-zinc-800 dark:text-zinc-100">
            {line}
            <span
              className="absolute -top-2 left-4 h-0 w-0 border-b-8 border-l-0 border-r-8 border-t-0 border-transparent border-b-white dark:border-b-zinc-800"
              aria-hidden
            />
          </div>
          {/* Step dots */}
          {stepNum > 0 && (
            <div className="flex gap-2" aria-label={`Step ${stepNum} of ${STEPS.length}`}>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full transition-all ${i + 1 === stepNum ? 'bg-violet-500 scale-125' : i + 1 < stepNum ? 'bg-violet-300' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content column */}
        <div className="w-full max-w-md">

          {/* ── Intro ── */}
          {phase === 'intro' && (
            <div className="flex flex-col items-center gap-6 rounded-3xl bg-white p-8 shadow-xl dark:bg-zinc-800">
              <div className="text-center">
                <div className="mb-3 text-6xl">{avatar}</div>
                <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                  Hey {kidName}!
                </h1>
                <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                  Got a game idea? Let&rsquo;s write it down and maybe one day it&rsquo;ll become a real game you can play!
                </p>
              </div>
              <ul className="w-full space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                {[
                  ['📝', 'Name your game'],
                  ['💬', 'Describe how it works'],
                  ['🖍️', 'Draw a picture (optional!)'],
                ].map(([emoji, text]) => (
                  <li key={text} className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-2.5 font-medium dark:bg-violet-900/20">
                    <span className="text-xl">{emoji}</span>
                    {text}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setPhase('name')}
                className="w-full rounded-2xl bg-violet-500 px-6 py-3 text-base font-bold text-white shadow-md transition hover:bg-violet-600 active:scale-95"
              >
                Let&rsquo;s go! →
              </button>
            </div>
          )}

          {/* ── Name ── */}
          {phase === 'name' && (
            <div className="flex flex-col gap-5 rounded-3xl bg-white p-7 shadow-xl dark:bg-zinc-800">
              <label className="flex flex-col gap-2">
                <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                  🎮 Game name
                </span>
                <input
                  type="text"
                  value={gameName}
                  onChange={e => setGameName(e.target.value)}
                  placeholder="e.g. Cookie Chaos, Super Shark Jump…"
                  maxLength={60}
                  autoFocus
                  className="rounded-2xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3 text-base font-medium text-zinc-800 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
                />
                <span className="text-right text-xs text-zinc-400">{gameName.length}/60</span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setPhase('intro')}
                  className="rounded-2xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setPhase('describe')}
                  disabled={!nameOk}
                  className="flex-1 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Describe ── */}
          {phase === 'describe' && (
            <div className="flex flex-col gap-5 rounded-3xl bg-white p-7 shadow-xl dark:bg-zinc-800">
              <div>
                <div className="mb-1 text-lg font-bold text-zinc-800 dark:text-zinc-100">
                  💬 How does it work?
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  What do you do? How do you win? Any characters or special moves?
                </div>
              </div>
              <textarea
                value={gameDesc}
                onChange={e => setGameDesc(e.target.value)}
                placeholder="In my game you control a cake that… you win by… there's also a boss that…"
                maxLength={500}
                rows={5}
                autoFocus
                className="resize-none rounded-2xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3 text-base text-zinc-800 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
              />
              <span className="text-right text-xs text-zinc-400">{gameDesc.length}/500</span>
              <div className="flex gap-3">
                <button
                  onClick={() => setPhase('name')}
                  className="rounded-2xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setPhase('draw')}
                  disabled={!descOk}
                  className="flex-1 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Draw ── */}
          {phase === 'draw' && (
            <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-zinc-800">
              <div className="text-base font-bold text-zinc-800 dark:text-zinc-100">
                🖍️ Draw your game
                <span className="ml-2 text-sm font-normal text-zinc-400">(optional)</span>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Colors */}
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => { setColor(c); setTool('pencil'); }}
                      title={c}
                      className={`h-7 w-7 rounded-full border-2 transition active:scale-90 ${color === c && tool === 'pencil' ? 'border-violet-500 scale-110' : 'border-transparent hover:border-zinc-300'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                {/* Eraser */}
                <button
                  onClick={() => setTool('eraser')}
                  className={`rounded-full border-2 px-3 py-1 text-sm font-semibold transition active:scale-95 ${tool === 'eraser' ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300'}`}
                >
                  🧹 Eraser
                </button>
                {/* Thickness */}
                <select
                  value={thickness}
                  onChange={e => setThickness(Number(e.target.value))}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                >
                  <option value={2}>Thin</option>
                  <option value={5}>Medium</option>
                  <option value={12}>Thick</option>
                </select>
                {/* Clear */}
                <button
                  onClick={clearCanvas}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  🗑 Clear
                </button>
              </div>

              {/* Canvas */}
              <div className="overflow-hidden rounded-2xl border-2 border-zinc-200 dark:border-zinc-700">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  className="w-full touch-none"
                  style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
              </div>

              {error && (
                <p className="text-center text-sm text-rose-600">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setPhase('describe')}
                  className="rounded-2xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  ← Back
                </button>
                <button
                  onClick={() => submit(true)}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:text-zinc-400"
                >
                  Skip drawing
                </button>
                <button
                  onClick={() => submit(false)}
                  className="flex-1 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-violet-600 active:scale-95"
                >
                  🚀 Send my idea!
                </button>
              </div>
            </div>
          )}

          {/* ── Sending ── */}
          {phase === 'sending' && (
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-10 shadow-xl dark:bg-zinc-800">
              <div className="text-4xl animate-spin">🎲</div>
              <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
                Sending your idea…
              </p>
            </div>
          )}

          {/* ── Sent ── */}
          {phase === 'sent' && (
            <div className="flex flex-col items-center gap-6 rounded-3xl bg-white p-8 text-center shadow-xl dark:bg-zinc-800">
              <div className="text-6xl">🎉</div>
              <div>
                <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                  &ldquo;{gameName}&rdquo; is on its way!
                </h2>
                <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                  A grown-up will read your idea. If it gets built, you&rsquo;ll see it here first!
                </p>
              </div>
              <div className="flex flex-col gap-3 w-full sm:flex-row sm:justify-center">
                <Link
                  href="/tickets"
                  className="rounded-2xl bg-violet-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-violet-600 active:scale-95"
                >
                  🧁 See what&rsquo;s baking
                </Link>
                <Link
                  href="/town"
                  className="rounded-2xl bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
                >
                  Back to the map
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
