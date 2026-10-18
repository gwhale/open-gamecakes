'use client';

// Cakey's words, lighting up as he says them.
//
// This is not a caption — his lines were already on screen. It is a reading
// support: text and speech pinned together word by word, which is the form that
// actually helps an emerging reader rather than just being accessible. One of
// the two kids on this app is below grade level on sight words.
//
// When there is no audio (muted, or a line rendered since the last build) it
// degrades to exactly what was there before: the plain sentence. Nothing about
// the bubble depends on speech working.

import { useEffect, useState } from 'react';
import { subscribeSpeech, getSpeechState, type SpeechState } from '@/lib/town/cakey-voice';

export default function SpokenText({ text }: { text: string }): React.ReactElement {
  const [speech, setSpeech] = useState<SpeechState>(() => getSpeechState());

  useEffect(() => subscribeSpeech(setSpeech), []);

  const line = (text ?? '').trim();
  // Only highlight when the store is describing THIS line. Two bubbles can be
  // mounted at once (the wandering one and the panel), and the wrong one lighting
  // up would be worse than none doing so.
  const active = speech.text === line && speech.words.length > 0;

  if (!active) return <>{text}</>;

  return (
    <>
      {speech.words.map((w, i) => (
        <span
          key={`${i}-${w}`}
          className={
            i === speech.wordIndex
              ? 'rounded-[4px] bg-amber-300/70 px-[2px] text-inherit dark:bg-amber-400/40'
              : undefined
          }
          // No transition on the highlight: it has to land ON the word as it is
          // spoken, and an ease makes it read as lagging behind him.
        >
          {w}
          {i < speech.words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}
