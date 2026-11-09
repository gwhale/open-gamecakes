// The scene behind the login form: the sea rolling onto Sprinkle Shore, the
// tide breathing over the wet sand, a ferry crossing the horizon, and Cakey
// wandering the beach. It replaces the three static radial-gradient blobs
// that used to sit back there.
//
// Server component, no state: every motion is a CSS animation on a
// repeating SVG wave (globals.css, `.shore-*`), so the page costs nothing
// extra to hydrate and the sea keeps rolling while the form is busy.
// Cakey is the ordinary GamecakesMascot; the walk and hop are wrappers
// around it, so his face stays the one every other page draws.
//
// Decorative only: the whole thing is aria-hidden and sits at -z-10 with
// pointer events off, so it can never catch a tap meant for the form.

import GamecakesMascot from '@/components/GamecakesMascot';

export default function LoginShore(): React.ReactElement {
  return (
    <div aria-hidden className="shore -z-10">
      <div className="shore-sun" />
      <div className="shore-cloud shore-cloud-1" />
      <div className="shore-cloud shore-cloud-2" />

      <div className="shore-sea">
        <div className="shore-wave shore-wave-far" />
        <div className="shore-glint" />
        <div className="shore-wave shore-wave-mid" />
        <div className="shore-wave shore-wave-near" />
      </div>

      <div className="shore-ferry">
        <Ferry />
      </div>

      <div className="shore-sand">
        <div className="shore-wet" />
        <div className="shore-foam" />
      </div>

      <div className="shore-cakey">
        <div className="shore-cakey-step">
          <GamecakesMascot mood="happy" size={128} aria-label="" />
        </div>
      </div>
    </div>
  );
}

/** The island ferry, seen from the beach: a cream hull with a rose stripe,
 *  a little cabin, and a puff of steam. Same shapes as the one on the water
 *  in the 3D town, flattened. */
function Ferry(): React.ReactElement {
  return (
    <svg viewBox="0 0 96 48" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="62" cy="9" rx="5" ry="3.5" fill="#ffffff" opacity="0.8" />
      <ellipse cx="68" cy="5" rx="3.5" ry="2.5" fill="#ffffff" opacity="0.6" />
      <rect x="56" y="10" width="6" height="12" rx="1" fill="#e11d48" />
      <rect x="30" y="16" width="40" height="12" rx="3" fill="#fef3c7" />
      <rect x="34" y="19" width="6" height="5" rx="1" fill="#7dd3fc" />
      <rect x="44" y="19" width="6" height="5" rx="1" fill="#7dd3fc" />
      <rect x="54" y="19" width="6" height="5" rx="1" fill="#7dd3fc" />
      <path d="M 8 28 H 88 L 78 42 H 20 Z" fill="#fffbeb" />
      <path d="M 8 28 H 88 L 86 31 H 10 Z" fill="#fb7185" />
    </svg>
  );
}
