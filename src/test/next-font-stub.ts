// Vitest stand-in for next/font/google. The real module is a build-time
// transform that Next's compiler rewrites; called at runtime outside Next it
// is not a function, so any component that loads a font (Musical Planets'
// staff) could not be imported by a test. Every font becomes an empty class.
type FontResult = { className: string; style: { fontFamily: string }; variable: string };
const font = (): FontResult => ({ className: '', style: { fontFamily: '' }, variable: '' });
export const Noto_Music = font;
export const Fredoka = font;
export const Geist = font;
export const Geist_Mono = font;
