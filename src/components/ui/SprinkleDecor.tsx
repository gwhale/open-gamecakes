// SprinkleDecor — scatter cake-palette sprinkles across a viewport.
//
// Drop into any top-level page that needs world-building atmosphere.
// The sprinkles are absolute-positioned at fixed corner zones so
// they read as decorative "ambient candy" rather than competing
// with content. Pointer-events-none so they never block taps.
//
// Two density modes:
//   - 'corners'  (default) — 4 corner clusters of 3 sprinkles each
//                            = 12 total. Cheap, atmospheric.
//   - 'scatter'  — 18 sprinkles spread across the full viewport,
//                  with the highest density toward the corners.
//
// Sprinkles are colored rotated rectangles drawn in inline SVG so
// they're crisp at any zoom and don't depend on an asset pipeline.

import { type CSSProperties } from 'react';

const SPRINKLE_COLORS = [
  '#fb7185', // strawberry
  '#fbbf24', // amber
  '#86efac', // mint
  '#93c5fd', // sky
  '#f9a8d4', // pink
  '#c4b5fd', // violet
];

interface Sprinkle {
  top: string;
  left: string;
  color: string;
  rotate: number;
  scale: number;
}

const CORNER_SPRINKLES: ReadonlyArray<Sprinkle> = [
  // Top-left cluster
  { top: '6%',  left: '4%',  color: '#fb7185', rotate: 18,  scale: 1.0 },
  { top: '12%', left: '8%',  color: '#fbbf24', rotate: -25, scale: 0.9 },
  { top: '4%',  left: '14%', color: '#86efac', rotate: 42,  scale: 1.1 },
  // Top-right
  { top: '8%',  left: '88%', color: '#f9a8d4', rotate: -15, scale: 1.0 },
  { top: '5%',  left: '93%', color: '#c4b5fd', rotate: 30,  scale: 0.95 },
  { top: '14%', left: '90%', color: '#93c5fd', rotate: -38, scale: 1.05 },
  // Bottom-left
  { top: '82%', left: '6%',  color: '#fbbf24', rotate: 22,  scale: 1.0 },
  { top: '88%', left: '12%', color: '#fb7185', rotate: -42, scale: 0.9 },
  { top: '90%', left: '4%',  color: '#86efac', rotate: 8,   scale: 1.1 },
  // Bottom-right
  { top: '85%', left: '92%', color: '#c4b5fd', rotate: 28,  scale: 1.05 },
  { top: '78%', left: '88%', color: '#fb7185', rotate: -22, scale: 0.95 },
  { top: '92%', left: '95%', color: '#fbbf24', rotate: 15,  scale: 1.0 },
];

const SCATTER_EXTRAS: ReadonlyArray<Sprinkle> = [
  // Mid-band scatter for the dense variant — kept off the typical
  // content vertical band (35-65% width) so they don't crowd text.
  { top: '30%', left: '2%',  color: '#86efac', rotate: 18,  scale: 0.85 },
  { top: '45%', left: '96%', color: '#fbbf24', rotate: -28, scale: 0.85 },
  { top: '58%', left: '4%',  color: '#f9a8d4', rotate: 38,  scale: 0.9 },
  { top: '68%', left: '94%', color: '#93c5fd', rotate: 12,  scale: 0.95 },
  { top: '24%', left: '95%', color: '#fb7185', rotate: -18, scale: 0.85 },
  { top: '74%', left: '2%',  color: '#c4b5fd', rotate: 25,  scale: 0.9 },
];

export interface SprinkleDecorProps {
  density?: 'corners' | 'scatter';
  /** Multiplier on sprinkle scale (default 1). Useful for smaller
   *  cards/panels that want a lighter touch than a full page. */
  scaleFactor?: number;
  /** Add extra inline style — for example, `zIndex: 0` to push
   *  sprinkles behind raised content. */
  style?: CSSProperties;
}

export function SprinkleDecor({
  density = 'corners',
  scaleFactor = 1,
  style,
}: SprinkleDecorProps): React.ReactElement {
  const sprinkles =
    density === 'scatter'
      ? [...CORNER_SPRINKLES, ...SCATTER_EXTRAS]
      : CORNER_SPRINKLES;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={style}
    >
      {sprinkles.map((s, i) => (
        <span
          key={i}
          className="absolute inline-block"
          style={{
            top: s.top,
            left: s.left,
            transform: `translate(-50%, -50%) rotate(${s.rotate}deg) scale(${s.scale * scaleFactor})`,
            width: 16,
            height: 5,
            borderRadius: 3,
            backgroundColor: s.color,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}
