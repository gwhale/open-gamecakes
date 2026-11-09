// Dynamically rendered apple-touch-icon — 180x180 PNG.
//
// iOS specifically wants a PNG (not SVG) for apple-touch-icon. Rather
// than ship a static PNG file, we generate it via Next.js's
// ImageResponse — same shapes as src/app/icon.svg drawn with vanilla
// JSX/CSS. This way a future palette tweak in palette.ts can cascade
// here too.
//
// Returned by Next at /apple-icon — referenced from manifest.ts as the
// raster icon path, and Next auto-injects the apple-touch-icon link
// tag into <head>.

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Strawberry → vanilla → mint cake gradient backdrop, soft.
          background:
            'linear-gradient(135deg, #fecdd3 0%, #fde68a 50%, #bbf7d0 100%)',
          borderRadius: '24px',
        }}
      >
        {/* Three-tier cake — same proportions as icon.svg, scaled to 180px */}
        <svg
          width="140"
          height="140"
          viewBox="0 0 128 128"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="64" cy="114" rx="54" ry="4" fill="#71717a" opacity="0.25" />
          <rect x="14" y="84" width="100" height="28" rx="5" fill="#fb7185" />
          <rect x="14" y="84" width="100" height="5" rx="2" fill="#fda4af" />
          <rect x="24" y="58" width="80" height="26" rx="5" fill="#fde68a" />
          <rect x="24" y="58" width="80" height="5" rx="2" fill="#fef3c7" />
          <rect x="36" y="34" width="56" height="24" rx="5" fill="#6ee7b7" />
          <rect x="36" y="34" width="56" height="5" rx="2" fill="#a7f3d0" />
          <path
            d="M 64 24 Q 74 14 80 8"
            stroke="#166534"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="64" cy="25" r="10" fill="#dc2626" />
          <circle cx="60" cy="21" r="3" fill="#fecaca" opacity="0.9" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
