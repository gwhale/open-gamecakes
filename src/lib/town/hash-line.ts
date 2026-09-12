// How a spoken line is turned into a filename.
//
// This lived twice: once in cakey-voice.ts (the browser, resolving a clip) and
// once in scripts/render-cakey-voice.mjs (the renderer, naming the file it
// writes). Both carried a comment asking the other to stay byte-identical,
// because the failure mode is invisible — a one-character drift makes every
// lookup miss, and Cakey silently drops to the browser voice instead of
// erroring where anyone would notice.
//
// A comment is not a mechanism. One function, imported by both, is.
//
// Deliberately dependency-free so the renderer can import it under Node's
// type-stripping without dragging in the manifest JSON, the sound settings, or
// anything else that expects a browser.
//
// FNV-1a, base36. The exact algorithm does not matter; not changing it does.
// Every file under public/voice/cakey is named for its output, so a change
// here orphans the entire rendered corpus and silently mutes Cakey until it is
// re-rendered. hash-line.test.ts pins known values against exactly that.

export function hashLine(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
