'use client';

// A treble staff with a real key signature, drawn in SVG.
//
// Sharps and flats are drawn as paths, not font glyphs: a glyph's baseline
// shifts from font to font, and a flat that sits half a space off its line is
// a different note to anyone who reads music. Positions come from
// signatureMarks() in theory.ts, which the tests pin to the standard engraved
// order. The clef is the one glyph (Noto Music, loaded below) because drawing
// a G clef by hand would be worse than any font's.
//
// The scale can be shown after the signature as whole notes with NO
// accidentals of their own. That is the point of the lesson: the F in G
// major's scale has no sharp beside it, and is still F♯, because the sign at
// the start of the line says so.

import { Noto_Music } from 'next/font/google';
import {
  majorScale,
  keyOf,
  pcName,
  signatureMarks,
  spokenName,
  staffStep,
  type KeyId,
  type Letter,
} from '@/lib/games/music/theory';

const notoMusic = Noto_Music({ weight: '400', subsets: ['music'], display: 'swap' });

/** Half the distance between two staff lines, in SVG units. */
const H = 6;
/** y of the bottom line (E4). */
const BASE = 100;
const yOf = (step: number): number => BASE - step * H;

const INK = '#27272a';
const FOCUS = '#f59e0b';
const LIT = '#10b981';

function Sharp({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeLinecap="round">
      <line x1={x - 2.6} y1={y - 11} x2={x - 2.6} y2={y + 12.5} strokeWidth={1.6} />
      <line x1={x + 2.6} y1={y - 12.5} x2={x + 2.6} y2={y + 11} strokeWidth={1.6} />
      <line x1={x - 5.5} y1={y - 2.2} x2={x + 5.5} y2={y - 5.2} strokeWidth={3} />
      <line x1={x - 5.5} y1={y + 5.2} x2={x + 5.5} y2={y + 2.2} strokeWidth={3} />
    </g>
  );
}

function Flat({ x, y, color }: { x: number; y: number; color: string }) {
  // The bowl's belly sits on the note's line or space; the stem rises above.
  return (
    <g stroke={color} fill="none" strokeLinecap="round">
      <line x1={x - 3} y1={y - 16} x2={x - 3} y2={y + 5} strokeWidth={1.6} />
      <path d={`M ${x - 3} ${y + 5} C ${x + 7} ${y}, ${x + 6} ${y - 7}, ${x - 3} ${y - 2.5}`} strokeWidth={2.4} />
    </g>
  );
}

export interface StaffProps {
  keyId: KeyId;
  /** Draw the scale after the signature. */
  showScale?: boolean;
  /** A letter to connect: its signature mark and its scale notes glow. */
  focusLetter?: Letter | null;
  /** Index into the scale of the note sounding right now. */
  litIndex?: number | null;
  /** Challenge mode / match mission: no note names under the notes. */
  hideNames?: boolean;
  /** The caption names the key. Off for "match the signature". */
  revealKey?: boolean;
}

export default function Staff({ keyId, showScale = true, focusLetter = null, litIndex = null, hideNames = false, revealKey = true }: StaffProps) {
  const k = keyOf(keyId);
  const marks = signatureMarks(k);
  const scale = majorScale(k);
  const sigStart = 72;
  const sigStep = 13;
  const notesStart = sigStart + Math.max(1, marks.length) * sigStep + 22;
  const noteStep = 30;
  const width = showScale ? notesStart + scale.length * noteStep + 8 : sigStart + Math.max(2, marks.length) * sigStep + 30;

  const sigWords = marks.length === 0
    ? 'no sharps or flats'
    : marks.map((mk) => `${spokenName({ letter: mk.pitch.letter, acc: mk.acc })} on the ${staffStep(mk.pitch) % 2 === 0 ? 'line' : 'space'}`).join(', ');
  const label = `Treble staff. Key signature: ${sigWords}.${revealKey ? ` ${k.id} major.` : ''}${showScale ? ` Scale: ${scale.map((p) => spokenName(p)).join(', ')}.` : ''}`;

  return (
    <svg
      viewBox={`0 0 ${width} 132`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      style={{ maxHeight: 190 }}
    >
      {/* five lines */}
      {[0, 2, 4, 6, 8].map((s) => (
        <line key={s} x1={6} x2={width - 4} y1={yOf(s)} y2={yOf(s)} stroke={INK} strokeWidth={1.2} />
      ))}
      <line x1={6} x2={6} y1={yOf(8)} y2={yOf(0)} stroke={INK} strokeWidth={1.4} />

      {/* treble clef: its curl wraps the G line (step 2) */}
      <text
        x={10}
        y={yOf(2) + 0.5}
        fontSize={74}
        className={notoMusic.className}
        fill={INK}
        aria-hidden
      >
        {'\u{1D11E}'}
      </text>

      {/* key signature */}
      {marks.map((mk, i) => {
        const x = sigStart + i * sigStep;
        const y = yOf(staffStep(mk.pitch));
        const on = focusLetter === mk.pitch.letter;
        return (
          <g key={mk.pitch.letter}>
            {on ? <circle cx={x} cy={y} r={13} fill={FOCUS} opacity={0.28} /> : null}
            {mk.acc === 1 ? <Sharp x={x} y={y} color={on ? '#b45309' : INK} /> : <Flat x={x} y={y} color={on ? '#b45309' : INK} />}
          </g>
        );
      })}

      {/* the scale, as whole notes with no accidentals of their own */}
      {showScale
        ? scale.map((p, i) => {
            const step = staffStep(p);
            const x = notesStart + i * noteStep;
            const y = yOf(step);
            const lit = litIndex === i;
            const focus = focusLetter === p.letter;
            const color = lit ? LIT : focus ? '#b45309' : INK;
            const ledgers: number[] = [];
            for (let s = -2; s >= step; s -= 2) ledgers.push(s);
            for (let s = 10; s <= step; s += 2) ledgers.push(s);
            return (
              <g key={i}>
                {focus || lit ? <circle cx={x} cy={y} r={11} fill={lit ? LIT : FOCUS} opacity={0.25} /> : null}
                {ledgers.map((s) => (
                  <line key={s} x1={x - 10} x2={x + 10} y1={yOf(s)} y2={yOf(s)} stroke={INK} strokeWidth={1.2} />
                ))}
                <ellipse cx={x} cy={y} rx={6.6} ry={4.6} fill="none" stroke={color} strokeWidth={2.6} transform={`rotate(-22 ${x} ${y})`} />
                {hideNames ? null : (
                  <text x={x} y={127} textAnchor="middle" fontSize={11} fontWeight={700} fill={color} className="font-display">
                    {pcName(p)}
                  </text>
                )}
              </g>
            );
          })
        : null}
    </svg>
  );
}
