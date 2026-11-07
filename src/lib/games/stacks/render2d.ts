// Cakey Stacks — the 2D Classic renderer.
//
// A flat arcade board on a plain canvas: crisp grid, beveled blocks, hard
// shapes, no camera. It exists for three reasons, in order of how much they
// matter: some kids simply read a flat board faster; it runs on anything with a
// pulse (no WebGL, no shaders, ~2 KB of drawing code); and it is the honest
// version of the game the 3D pan is decorating.
//
// It is NOT a downgrade skin — the frosting caps, the sprinkle bursts and the
// pan rim are all here, drawn flat. Same rules, same feel, fewer polygons.

import { COLS, ROWS, PIECE_TYPES, cellsOf, type Cell } from './logic';
import { FLAVOURS, SPRINKLES, type StacksFrame, type StacksRenderer } from './types';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

interface Sprinkle {
  x: number; y: number; vx: number; vy: number; life: number; ttl: number;
  color: string; rot: number; spin: number;
}

/** Board padding inside the canvas, as a fraction of the cell size. */
const PAD_CELLS = 0.55;

export function createStacks2DRenderer(
  container: HTMLElement,
  opts: { reducedMotion?: boolean } = {},
): StacksRenderer {
  const reduced = opts.reducedMotion === true;

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  let cell = 24;
  let originX = 0;
  let originY = 0;
  let dpr = 1;
  const sprinkles: Sprinkle[] = [];
  let punchT = 0;      // 0..1 decaying screen-shake energy
  let punchAmt = 0;

  function layout(): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the pan with a little breathing room, then centre it.
    cell = Math.floor(Math.min(w / (COLS + PAD_CELLS * 2), h / (ROWS + PAD_CELLS * 2)));
    cell = Math.max(8, cell);
    originX = Math.round((w - cell * COLS) / 2);
    originY = Math.round((h - cell * ROWS) / 2);
  }
  layout();

  // ---- painters ----

  function block(px: number, py: number, size: number, type: number, alpha = 1, scale = 1): void {
    const f = FLAVOURS[PIECE_TYPES[type - 1]];
    const s = size * scale;
    const off = (size - s) / 2;
    const x = px + off;
    const y = py + off;
    const r = Math.max(2, s * 0.22);
    ctx.globalAlpha = alpha;
    // body
    ctx.fillStyle = hex(f.body);
    roundRect(x + 1, y + 1, s - 2, s - 2, r);
    ctx.fill();
    // frosting cap — the top third, so a stack reads as layered cake
    ctx.fillStyle = hex(f.cap);
    roundRect(x + 1 + s * 0.14, y + 1 + s * 0.12, s * 0.72 - 2, s * 0.26, r * 0.6);
    ctx.fill();
    // shaded base
    ctx.fillStyle = hex(f.shade);
    ctx.globalAlpha = alpha * 0.55;
    roundRect(x + 1 + s * 0.14, y + s * 0.74, s * 0.72 - 2, s * 0.18, r * 0.5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  }

  function drawPan(danger: boolean): void {
    const w = cell * COLS;
    const h = cell * ROWS;
    // pan floor
    ctx.fillStyle = danger ? '#3a1d2a' : '#241a2e';
    roundRect(originX - 6, originY - 6, w + 12, h + 12, 14);
    ctx.fill();
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(originX + x * cell + 0.5, originY);
      ctx.lineTo(originX + x * cell + 0.5, originY + h);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(originX, originY + y * cell + 0.5);
      ctx.lineTo(originX + w, originY + y * cell + 0.5);
    }
    ctx.stroke();
    // rim
    ctx.strokeStyle = danger ? 'rgba(251,113,133,0.95)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    roundRect(originX - 6, originY - 6, w + 12, h + 12, 14);
    ctx.stroke();
  }

  function drawGhost(cells: Cell[]): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([Math.max(3, cell * 0.18), Math.max(3, cell * 0.14)]);
    ctx.lineWidth = 2;
    for (const c of cells) {
      if (c.y < 0) continue;
      roundRect(originX + c.x * cell + 3, originY + c.y * cell + 3, cell - 6, cell - 6, cell * 0.2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function stepSprinkles(dt: number): void {
    for (let i = sprinkles.length - 1; i >= 0; i--) {
      const s = sprinkles[i];
      s.life += dt;
      if (s.life >= s.ttl) { sprinkles.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 0.0016 * dt;      // gravity, px/ms²
      s.rot += s.spin * dt;
      const a = 1 - s.life / s.ttl;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      const len = cell * 0.28;
      ctx.fillRect(-len / 2, -len / 6, len, len / 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  return {
    draw(frame: StacksFrame, dtMs: number) {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      ctx.clearRect(0, 0, w, h);

      // Backdrop — a warm bakery wash so the flat board still reads Gamecakes.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, frame.danger ? '#40222f' : '#2b1c3a');
      grad.addColorStop(1, '#14101f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      if (punchT > 0 && !reduced) {
        punchT = Math.max(0, punchT - dtMs / 260);
        const k = punchT * punchT * punchAmt * cell * 0.35;
        ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      }

      drawPan(frame.danger);

      // Locked cells. Rows mid-clear flash white and shrink.
      const clearingRows = new Set(frame.clearing?.rows ?? []);
      const t = frame.clearing?.t ?? 0;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const v = frame.board[y * COLS + x];
          if (!v) continue;
          const px = originX + x * cell;
          const py = originY + y * cell;
          if (clearingRows.has(y)) {
            block(px, py, cell, v, 1 - t, 1 - t * 0.6);
            ctx.globalAlpha = (1 - t) * 0.85;
            ctx.fillStyle = '#ffffff';
            roundRect(px + 2, py + 2, cell - 4, cell - 4, cell * 0.22);
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            block(px, py, cell, v);
          }
        }
      }

      if (frame.ghost) drawGhost(cellsOf(frame.ghost));

      if (frame.active) {
        const type = PIECE_TYPES.indexOf(frame.active.type) + 1;
        // Sub-cell interpolation so the fall glides instead of ratcheting.
        const slide = reduced ? 0 : frame.stepT * cell;
        for (const c of cellsOf(frame.active)) {
          if (c.y < -1) continue;
          block(originX + c.x * cell, originY + c.y * cell + slide, cell, type);
        }
      }

      stepSprinkles(dtMs);
      ctx.restore();
    },

    pxPerCell: () => cell,
    boardOrigin: () => ({ x: originX, y: originY }),

    burst(cells: Cell[], kind) {
      if (reduced || kind === 'lock') return;
      const per = kind === 'bomb' ? 3 : 4;
      for (const c of cells) {
        for (let i = 0; i < per; i++) {
          const ang = Math.random() * Math.PI * 2;
          const speed = (0.06 + Math.random() * 0.14) * cell * 0.06;
          sprinkles.push({
            x: originX + (c.x + 0.5) * cell,
            y: originY + (c.y + 0.5) * cell,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed - 0.12,
            life: 0,
            ttl: 520 + Math.random() * 380,
            color: hex(SPRINKLES[(Math.random() * SPRINKLES.length) | 0]),
            rot: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 0.02,
          });
        }
      }
      if (sprinkles.length > 400) sprinkles.splice(0, sprinkles.length - 400);
    },

    punch(strength: number) {
      if (reduced) return;
      punchAmt = Math.max(punchAmt * 0.5, Math.min(1, strength));
      punchT = 1;
    },

    resize() { layout(); },

    dispose() {
      sprinkles.length = 0;
      canvas.remove();
    },
  };
}
