// Cakey — the Gamecakes mascot.
//
// An anthropomorphized version of the brand cake logo: same strawberry +
// vanilla + mint layers and cherry on top, but with eyes on the vanilla
// layer, a smile, and little arms peeking out of the strawberry layer.
// The cherry on top doubles as a tiny hat.
//
// Variants ("moods") swap only the facial features and arm positions;
// the cake itself is identical across all moods so Cakey reads as the
// same character. Six moods: idle, happy, wave, celebrate, and think + oops,
// which the in-game reactions use (CakeyReactions) while a kid answers.
//
// Why inline SVG: crisp on retina, ~2KB gzipped, CSS-animatable per part
// without asset gymnastics. Matches the existing GamecakesLogo shape so
// players recognize Cakey as "the logo, but awake."

import type { CSSProperties } from 'react';

export type CakeyMood = 'idle' | 'happy' | 'wave' | 'celebrate' | 'think' | 'oops';

export interface GamecakesMascotProps {
  /** Height in pixels. Width auto-scales from the SVG aspect ratio. */
  size?: number;
  /** Facial expression + pose. Defaults to idle (gentle bob). */
  mood?: CakeyMood;
  className?: string;
  /** Optional screen-reader label. Defaults to "Cakey". */
  'aria-label'?: string;
  /** Mouth opens and closes, for while his voice is playing. Overrides the
   *  mood's mouth; the eyes and arms stay the mood's. */
  talking?: boolean;
}

export default function GamecakesMascot({
  size = 80,
  mood = 'idle',
  className = '',
  'aria-label': ariaLabel = 'Cakey',
  talking = false,
}: GamecakesMascotProps) {
  const style: CSSProperties = { height: size, width: 'auto' };

  return (
    <svg
      viewBox="0 0 140 140"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      className={`cakey cakey-${mood} ${talking ? 'cakey-talking' : ''} ${className}`}
      style={style}
    >
      {/* Define the bob + wave animations once so they can apply per-part. */}
      <defs>
        <style>{`
          .cakey { overflow: visible; }
          @keyframes cakey-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
          @keyframes cakey-bounce { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.04); } }
          @keyframes cakey-wave-arm {
            0%,100% { transform: rotate(0deg); }
            25%     { transform: rotate(-35deg); }
            75%     { transform: rotate(-20deg); }
          }
          @keyframes cakey-cherry-wiggle {
            0%,100% { transform: rotate(0); }
            50%     { transform: rotate(-8deg); }
          }
          /* Oops: one wobble that settles, never a loop — it is a flinch, not a scold. */
          @keyframes cakey-wobble {
            0%   { transform: rotate(0); }
            20%  { transform: rotate(-7deg); }
            40%  { transform: rotate(5deg); }
            60%  { transform: rotate(-3deg); }
            80%  { transform: rotate(1.5deg); }
            100% { transform: rotate(0); }
          }
          /* Default (idle): gentle breathing bob on the whole cake. */
          .cakey-idle       .cakey-body  { animation: cakey-bob 3.2s ease-in-out infinite; transform-origin: 70px 120px; }
          .cakey-happy      .cakey-body  { animation: cakey-bob 2.4s ease-in-out infinite; transform-origin: 70px 120px; }
          .cakey-wave       .cakey-body  { animation: cakey-bob 2.8s ease-in-out infinite; transform-origin: 70px 120px; }
          .cakey-wave       .cakey-arm-r { animation: cakey-wave-arm 1.6s ease-in-out infinite; transform-origin: 118px 100px; }
          .cakey-celebrate  .cakey-body  { animation: cakey-bounce 0.9s ease-in-out infinite; transform-origin: 70px 120px; }
          .cakey-celebrate  .cakey-cherry { animation: cakey-cherry-wiggle 0.9s ease-in-out infinite; transform-origin: 70px 30px; }
          .cakey-think      .cakey-body  { animation: cakey-bob 3.6s ease-in-out infinite; transform-origin: 70px 120px; }
          .cakey-think      .cakey-cherry { animation: cakey-cherry-wiggle 2.4s ease-in-out infinite; transform-origin: 70px 30px; }
          .cakey-oops       .cakey-body  { animation: cakey-wobble 0.9s ease-out 1; transform-origin: 70px 134px; }

          /* Talking: the mouth opens and shuts at a speaking rate, and the bob
             quickens a little so the whole cake reads as the one talking. */
          @keyframes cakey-talk { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
          .cakey-talking .cakey-mouth-talk { animation: cakey-talk 0.26s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
          .cakey-talking .cakey-body { animation: cakey-bob 1.1s ease-in-out infinite; transform-origin: 70px 120px; }

          /* Respect users who opt out of motion. A talking mouth just stays
             open, so he still visibly reads as the one speaking. */
          @media (prefers-reduced-motion: reduce) {
            .cakey-body, .cakey-arm-r, .cakey-cherry, .cakey-mouth-talk { animation: none !important; }
          }
        `}</style>
      </defs>

      {/* Everything animatable lives in cakey-body so the bob is one transform. */}
      <g className="cakey-body">
        {/* Legs — short SpongeBob-style stubs with white socks + cherry-red shoes.
            Drawn BEFORE the strawberry layer so the strawberry covers the top
            of each leg cleanly (no seam). */}
        <Legs />

        {/* Bottom layer — strawberry pink */}
        <g>
          <rect x="18" y="96" width="104" height="28" rx="5" fill="#fb7185" />
          <rect x="18" y="96" width="104" height="5"  rx="2" fill="#fda4af" />
          <circle cx="34" cy="112" r="1.5" fill="#fffbeb" />
          <circle cx="52" cy="108" r="1.5" fill="#fffbeb" />
          <circle cx="66" cy="114" r="1.5" fill="#fffbeb" />
          <circle cx="82" cy="110" r="1.5" fill="#fffbeb" />
          <circle cx="98" cy="115" r="1.5" fill="#fffbeb" />
          <circle cx="110" cy="109" r="1.5" fill="#fffbeb" />
        </g>

        {/* Arms — extend from the bottom layer, one on each side. The
            right arm gets its own class so the wave animation can find it. */}
        <Arms mood={mood} />

        {/* Middle layer — vanilla, hosts the face */}
        <g>
          <rect x="28" y="70" width="84" height="26" rx="5" fill="#fde68a" />
          <rect x="28" y="70" width="84" height="5"  rx="2" fill="#fef3c7" />
          {/* Cheek blushes — tiny pink dots */}
          <ellipse cx="44" cy="88" rx="4" ry="2.5" fill="#fca5a5" opacity="0.7" />
          <ellipse cx="96" cy="88" rx="4" ry="2.5" fill="#fca5a5" opacity="0.7" />
          {/* Face (eyes + mouth) */}
          <Face mood={mood} talking={talking} />
        </g>

        {/* Thinking hand at the cheek — drawn after the vanilla layer, which
            would otherwise cover it. */}
        {mood === 'think' ? <ThinkArm /> : null}

        {/* Top layer — mint */}
        <g>
          <rect x="40" y="46" width="60" height="24" rx="5" fill="#6ee7b7" />
          <rect x="40" y="46" width="60" height="5"  rx="2" fill="#a7f3d0" />
        </g>

        {/* Cherry + stem on top (cherry wiggles in celebrate mood) */}
        <g className="cakey-cherry">
          <path
            d="M 70 36 Q 80 26 86 20"
            stroke="#166534"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="70" cy="37" r="10" fill="#dc2626" />
          <circle cx="66" cy="33" r="3" fill="#fecaca" opacity="0.9" />
        </g>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Face — eyes + mouth. Swaps per mood.
// ---------------------------------------------------------------------------

function Face({ mood, talking }: { mood: CakeyMood; talking: boolean }) {
  // Eyes: centered near top of vanilla layer. Pupils shift subtly by mood
  // so Cakey feels like he's looking at *you* (down-and-forward) vs.
  // looking up in excitement (celebrate).
  // Think looks up and away (working it out); Oops goes wide-eyed with small
  // pupils (surprised, not upset).
  const pupilY = mood === 'celebrate' ? 79 : mood === 'think' ? 78 : 81;
  const pupilDX = mood === 'think' ? -2 : 0;
  const eyeR = mood === 'oops' ? 9 : 8;
  const pupilR = mood === 'oops' ? 3 : 4.5;

  return (
    <>
      {/* Eye whites — round, with a dark outline so they pop on the vanilla. */}
      <circle cx="50" cy="82" r={eyeR} fill="#ffffff" stroke="#1f2937" strokeWidth="1.2" />
      <circle cx="90" cy="82" r={eyeR} fill="#ffffff" stroke="#1f2937" strokeWidth="1.2" />
      {/* Pupils — big round dots, centered but shifted per mood. */}
      <circle cx={50 + pupilDX} cy={pupilY + 1} r={pupilR} fill="#1f2937" />
      <circle cx={90 + pupilDX} cy={pupilY + 1} r={pupilR} fill="#1f2937" />
      {/* Double highlights — big upper-left shine + small lower-right speck. */}
      <circle cx={47.5 + pupilDX} cy={pupilY - 1} r="1.8" fill="#ffffff" />
      <circle cx={87.5 + pupilDX} cy={pupilY - 1} r="1.8" fill="#ffffff" />
      <circle cx={52 + pupilDX} cy={pupilY + 3.5} r="0.9" fill="#ffffff" />
      <circle cx={92 + pupilDX} cy={pupilY + 3.5} r="0.9" fill="#ffffff" />

      {/* Mouth — open and moving while he talks, otherwise per mood */}
      {talking ? (
        <g className="cakey-mouth-talk">
          <ellipse cx="70" cy="91" rx="6" ry="5" fill="#1f2937" />
          <ellipse cx="70" cy="93" rx="3.6" ry="2.2" fill="#dc2626" />
        </g>
      ) : mood === 'idle' ? (
        <path
          d="M 61 90 Q 70 94 79 90"
          stroke="#1f2937"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      {!talking && (mood === 'happy' || mood === 'wave') ? (
        <path
          d="M 60 89 Q 70 96 80 89 Q 78 93 70 93 Q 62 93 60 89 Z"
          fill="#1f2937"
        />
      ) : null}
      {!talking && mood === 'celebrate' ? (
        <>
          {/* Wide-open shout */}
          <ellipse cx="70" cy="91" rx="5" ry="4" fill="#1f2937" />
          <ellipse cx="70" cy="92.5" rx="3" ry="2" fill="#dc2626" />
        </>
      ) : null}
      {!talking && mood === 'think' ? (
        <path
          d="M 63 91 Q 66.5 88.5 70 91 Q 73.5 93.5 77 91"
          stroke="#1f2937"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      {!talking && mood === 'oops' ? <ellipse cx="70" cy="91.5" rx="3" ry="3.5" fill="#1f2937" /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Legs — short stubby SpongeBob-style legs with socks + shoes.
// ---------------------------------------------------------------------------

function Legs() {
  // Each leg: vanilla-colored stub (blends with a "sock" band), then a
  // cherry-red shoe at the foot. The tops of the legs tuck under the
  // strawberry layer so there's no visible seam.
  return (
    <g>
      {/* Left leg */}
      <rect x="48" y="120" width="10" height="14" rx="3" fill="#fde68a" />
      {/* Left sock band — white stripe near the top of the shoe */}
      <rect x="47" y="131" width="12" height="3" rx="1" fill="#ffffff" />
      {/* Left shoe — cherry-red rounded pill matching the cherry on top */}
      <ellipse cx="53" cy="136" rx="8" ry="3.5" fill="#dc2626" />
      <ellipse cx="51" cy="135" rx="2" ry="0.8" fill="#fecaca" opacity="0.9" />

      {/* Right leg */}
      <rect x="82" y="120" width="10" height="14" rx="3" fill="#fde68a" />
      <rect x="81" y="131" width="12" height="3" rx="1" fill="#ffffff" />
      <ellipse cx="87" cy="136" rx="8" ry="3.5" fill="#dc2626" />
      <ellipse cx="85" cy="135" rx="2" ry="0.8" fill="#fecaca" opacity="0.9" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Arms — two little nubs from the bottom layer.
// ---------------------------------------------------------------------------

function Arms({ mood }: { mood: CakeyMood }) {
  if (mood === 'celebrate') {
    // Both arms up in a V. Drawn as rounded paths from the strawberry
    // shoulder up and out, ending in small circle "hands."
    return (
      <g>
        <path
          d="M 22 102 Q 10 88 6 70"
          stroke="#fb7185"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="6" cy="70" r="5" fill="#fda4af" />

        <path
          d="M 118 102 Q 130 88 134 70"
          stroke="#fb7185"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="134" cy="70" r="5" fill="#fda4af" />
      </g>
    );
  }

  if (mood === 'wave') {
    // Left arm hangs; right arm raised out to the side and animated.
    return (
      <g>
        {/* Left arm — resting */}
        <rect x="14" y="102" width="8" height="14" rx="4" fill="#fb7185" />
        <circle cx="18" cy="118" r="4" fill="#fda4af" />

        {/* Right arm — raised, waves via CSS keyframes */}
        <g className="cakey-arm-r">
          <path
            d="M 118 100 Q 128 90 138 82"
            stroke="#fb7185"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="138" cy="82" r="5" fill="#fda4af" />
        </g>
      </g>
    );
  }

  if (mood === 'oops') {
    // Both arms flung out low — a startled "whoa", not hands-up celebrating.
    return (
      <g>
        <path d="M 22 104 Q 12 100 6 90" stroke="#fb7185" strokeWidth="7" strokeLinecap="round" fill="none" />
        <circle cx="6" cy="90" r="5" fill="#fda4af" />
        <path d="M 118 104 Q 128 100 134 90" stroke="#fb7185" strokeWidth="7" strokeLinecap="round" fill="none" />
        <circle cx="134" cy="90" r="5" fill="#fda4af" />
      </g>
    );
  }

  if (mood === 'think') {
    // Left arm hangs; the right one is <ThinkArm/>, drawn over the face.
    return (
      <g>
        <rect x="14" y="102" width="8" height="14" rx="4" fill="#fb7185" />
        <circle cx="18" cy="118" r="4" fill="#fda4af" />
      </g>
    );
  }

  // idle / happy — both arms hang down from the body.
  return (
    <g>
      <rect x="14" y="102" width="8" height="14" rx="4" fill="#fb7185" />
      <circle cx="18" cy="118" r="4" fill="#fda4af" />
      <rect x="118" y="102" width="8" height="14" rx="4" fill="#fb7185" />
      <circle cx="122" cy="118" r="4" fill="#fda4af" />
    </g>
  );
}

/** The right arm bent up so the hand rests by the right cheek. */
function ThinkArm() {
  return (
    <g>
      <path d="M 120 104 Q 127 90 104 90" stroke="#fb7185" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="102" cy="90" r="5" fill="#fda4af" />
    </g>
  );
}
