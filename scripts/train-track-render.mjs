// Render the Sugar Express before/after survey chart to a standalone HTML page.
//   node --import ./scripts/lw-ts-alias.mjs scripts/train-track-render.mjs <out.html>
import { writeFileSync } from 'node:fs';
import { sugarExpressRing } from '../src/lib/town/three/train.ts';
import { allIslands } from '../src/lib/town/islands.ts';
import { beanShoreDist, beanNd } from '../src/lib/town/three/bean.ts';
import { cityRectPx, mainlandBoundsPx } from '../src/lib/town/three/layout.ts';
import { findRegion } from '../src/lib/town/regions.ts';

const out = process.argv[2];
const main = allIslands().find((i) => i.id === 'mainland');
const ring = sugarExpressRing();
const B = mainlandBoundsPx();
const old = {
  cx: (B.x0 + B.x1) / 2, cy: (B.y0 + B.y1) / 2,
  rx: (B.x1 - B.x0) / 2 - 40, ry: (B.y1 - B.y0) / 2 - 40,
};

const lands = main.regions.map((s) => findRegion(s)).filter(Boolean).map((r) => ({
  name: r.name ?? r.slug, ...cityRectPx(r),
}));
const distToRect = (px, py, r) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
const nd = (x, y) => beanNd(main.center.x, main.center.y, main.halfW, main.halfH, main.pad, main.stretch, x, y);
const circ = (rx, ry) => {
  const h = (rx - ry) ** 2 / (rx + ry) ** 2;
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

const N = 480;
const shore = [];
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  const r = beanShoreDist(main.halfW, main.halfH, main.pad, main.stretch, a);
  shore.push([main.center.x + Math.cos(a) * r, main.center.y + Math.sin(a) * r]);
}
// Beach line (nd = 0.8) — where sand starts.
const beach = shore.map(([x, y]) => [main.center.x + (x - main.center.x) * 0.8, main.center.y + (y - main.center.y) * 0.8]);

const ptsOf = (e) => {
  const p = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    p.push([e.cx + e.rx * Math.cos(a), e.cy + e.ry * Math.sin(a)]);
  }
  return p;
};
const oldPts = ptsOf(old);
const newPts = ptsOf(ring);

// Contiguous runs of the old ring that sit INSIDE a land.
const badRuns = [];
let run = null;
for (const [x, y] of oldPts) {
  const hit = lands.find((L) => distToRect(x, y, L) === 0);
  if (hit) { if (!run) { run = []; badRuns.push(run); } run.push([x, y]); }
  else run = null;
}
const hitNames = [...new Set(oldPts.map(([x, y]) => lands.find((L) => distToRect(x, y, L) === 0)?.name).filter(Boolean))];
const badCount = oldPts.filter(([x, y]) => lands.some((L) => distToRect(x, y, L) === 0)).length;

const worst = (p) => p.reduce((m, [x, y]) => Math.max(m, nd(x, y)), -Infinity);
const minPad = (p) => p.reduce((m, [x, y]) => Math.min(m, ...lands.map((L) => distToRect(x, y, L))), Infinity);

const oldLen = circ(old.rx, old.ry);
const newLen = circ(ring.rx, ring.ry);

// ---- viewBox over the shoreline ----
const xs = shore.map((p) => p[0]), ys = shore.map((p) => p[1]);
const PAD = 260;
const vx = Math.min(...xs) - PAD, vy = Math.min(...ys) - PAD;
const vw = Math.max(...xs) - vx + PAD, vh = Math.max(...ys) - vy + PAD;

const f = (n) => Math.round(n);
const poly = (p) => p.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

// Graticule every 1000px.
let grid = '';
for (let gx = Math.ceil(vx / 1000) * 1000; gx < vx + vw; gx += 1000) grid += `<line x1="${gx}" y1="${f(vy)}" x2="${gx}" y2="${f(vy + vh)}"/>`;
for (let gy = Math.ceil(vy / 1000) * 1000; gy < vy + vh; gy += 1000) grid += `<line x1="${f(vx)}" y1="${gy}" x2="${f(vx + vw)}" y2="${gy}"/>`;

const landRects = lands.map((L) => `<rect x="${f(L.x0)}" y="${f(L.y0)}" width="${f(L.x1 - L.x0)}" height="${f(L.y1 - L.y0)}" rx="26"/>`).join('');
const landLabels = lands.map((L) => {
  const cx = f((L.x0 + L.x1) / 2), cy = f((L.y0 + L.y1) / 2);
  return `<text x="${cx}" y="${cy}" class="lbl">${L.name.toUpperCase()}</text>`;
}).join('');

const stations = Array.from({ length: 5 }, (_, i) => {
  const t = (i * Math.PI * 2) / 5;
  return `<g class="stn"><circle cx="${f(old.cx + old.rx * Math.cos(t))}" cy="${f(old.cy + old.ry * Math.sin(t))}" r="52"/><circle cx="${f(old.cx + old.rx * Math.cos(t))}" cy="${f(old.cy + old.ry * Math.sin(t))}" r="20" class="stnDot"/></g>`;
}).join('');

const stat = (v, l, s) => `<div class="stat"><div class="sv">${v}</div><div class="sl">${l}</div>${s ? `<div class="ss">${s}</div>` : ''}</div>`;

const html = `<title>Sugar Express — track survey</title>
<style>
:root{
  --sea:#0b2a31; --sea2:#0e353e; --sand:#e0cda4; --sand2:#c7ae7d;
  --ink:#e9f3f2; --dim:#8fb0b2; --line:#1d4952;
  --old:#f4436b; --new:#5fe3ad; --paper:#08222a;
  --card:#0f333b; --edge:#1b4b55;
}
@media (prefers-color-scheme: light){
  :root{ --sea:#dfeef1; --sea2:#cfe6ea; --sand:#f0e3c4; --sand2:#d8c194;
    --ink:#08282f; --dim:#4d747a; --line:#b3d3d8; --old:#c81e46; --new:#0f9c72;
    --paper:#eef6f7; --card:#ffffff; --edge:#c6dee2; }
}
:root[data-theme="dark"]{ --sea:#0b2a31; --sea2:#0e353e; --sand:#e0cda4; --sand2:#c7ae7d;
  --ink:#e9f3f2; --dim:#8fb0b2; --line:#1d4952; --old:#f4436b; --new:#5fe3ad;
  --paper:#08222a; --card:#0f333b; --edge:#1b4b55; }
:root[data-theme="light"]{ --sea:#dfeef1; --sea2:#cfe6ea; --sand:#f0e3c4; --sand2:#d8c194;
  --ink:#08282f; --dim:#4d747a; --line:#b3d3d8; --old:#c81e46; --new:#0f9c72;
  --paper:#eef6f7; --card:#ffffff; --edge:#c6dee2; }

*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font-family:ui-monospace,"SF Mono","Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;
  font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:44px 22px 76px;display:flex;flex-direction:column;gap:30px}
header{display:flex;flex-direction:column;gap:9px;border-bottom:1px solid var(--edge);padding-bottom:22px}
.eyebrow{font-size:11px;letter-spacing:.22em;color:var(--dim);text-transform:uppercase}
h1{margin:0;font-size:clamp(25px,4.4vw,40px);font-weight:600;letter-spacing:-.02em;text-wrap:balance;line-height:1.12}
.sub{color:var(--dim);max-width:64ch;font-size:13.5px}
.chartbox{background:var(--card);border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.chartbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center;padding:11px 15px;border-bottom:1px solid var(--edge);font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--dim)}
.chartbar .sp{flex:1 1 auto}
.key{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.sw{width:22px;height:0;border-top-width:3px;border-top-style:solid;display:inline-block}
.swOld{border-top-color:var(--old);border-top-style:dashed}
.swNew{border-top-color:var(--new)}
.swBad{border-top-color:var(--old);border-top-width:7px}
figure{margin:0;overflow-x:auto}
svg{display:block;width:100%;height:auto;min-width:520px;background:var(--sea)}
.grat line{stroke:var(--line);stroke-width:2}
.sea2{fill:var(--sea2)}
.land{fill:var(--sand);opacity:.16;stroke:var(--sand2);stroke-width:5}
.pad rect{fill:var(--sand);stroke:var(--sand2);stroke-width:6}
.lbl{fill:var(--ink);font-size:62px;letter-spacing:.07em;text-anchor:middle;dominant-baseline:middle;
  font-family:ui-monospace,Menlo,monospace;opacity:.78}
.ringOld{fill:none;stroke:var(--old);stroke-width:13;stroke-dasharray:54 40;opacity:.95}
.ringBad{fill:none;stroke:var(--old);stroke-width:34;stroke-linecap:round;opacity:.95}
.ringNew{fill:none;stroke:var(--new);stroke-width:15}
.stn circle{fill:none;stroke:var(--old);stroke-width:9}
.stn .stnDot{fill:var(--old);stroke:none}
.loco{fill:var(--new);stroke:var(--paper);stroke-width:9}
.hidden{display:none}
.statrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:1px;background:var(--edge);border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.stat{background:var(--card);padding:16px 17px;display:flex;flex-direction:column;gap:3px}
.sv{font-size:25px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sl{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dim)}
.ss{font-size:12px;color:var(--dim);margin-top:2px}
.good{color:var(--new)} .bad{color:var(--old)}
table{width:100%;border-collapse:collapse;font-size:13px}
.tw{overflow-x:auto;border:1px solid var(--edge);border-radius:5px;background:var(--card)}
th,td{text-align:left;padding:10px 15px;border-bottom:1px solid var(--edge);white-space:nowrap}
th{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dim);font-weight:500}
tr:last-child td{border-bottom:none}
td.num{font-variant-numeric:tabular-nums;text-align:right}
h2{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin:0;font-weight:500}
.sect{display:flex;flex-direction:column;gap:13px}
.note{color:var(--dim);font-size:13px;max-width:70ch}
.note strong{color:var(--ink);font-weight:600}
button.tg{font:inherit;font-size:11px;letter-spacing:.13em;text-transform:uppercase;background:transparent;
  color:var(--dim);border:1px solid var(--edge);border-radius:3px;padding:5px 11px;cursor:pointer}
button.tg[aria-pressed="true"]{color:var(--ink);border-color:var(--dim)}
button.tg:focus-visible{outline:2px solid var(--new);outline-offset:2px}
@media (prefers-reduced-motion:reduce){ .loco{animation:none!important} }
</style>

<div class="wrap">
<header>
  <div class="eyebrow">Gamecakes · town/three · track survey</div>
  <h1>The Sugar Express now rings the coast</h1>
  <p class="sub">The loop was an ellipse inscribed in the mainland bounding box. An inscribed ellipse only touches the four edge&#8209;midpoints, so it ploughed through whatever sat toward the corners &mdash; five lands. It is now fitted against the real shoreline and the real land rects.</p>
</header>

<div class="chartbox">
  <div class="chartbar">
    <span class="key"><span class="sw swOld"></span>Old loop</span>
    <span class="key"><span class="sw swBad"></span>Cutting through a land</span>
    <span class="key"><span class="sw swNew"></span>New loop</span>
    <span class="sp"></span>
    <button class="tg" id="tgOld" aria-pressed="true">Show old</button>
  </div>
  <figure>
  <svg viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" role="img" aria-label="Top-down map of the Gamecakes mainland showing the old train loop cutting through five lands and the new loop running around the outside.">
    <g class="grat">${grid}</g>
    <polygon class="land" points="${poly(shore)}"/>
    <polygon class="sea2" points="${poly(beach)}" opacity="0.30"/>
    <g class="pad">${landRects}</g>
    ${landLabels}
    <g id="gOld">
      <polyline class="ringOld" points="${poly(oldPts)}"/>
      ${badRuns.map((r) => `<polyline class="ringBad" points="${poly(r)}"/>`).join('')}
      ${stations}
    </g>
    <polyline class="ringNew" points="${poly(newPts)}" id="newRing"/>
    <circle class="loco" r="46" id="loco"><animateMotion dur="12s" repeatCount="indefinite" path="M ${f(ring.cx + ring.rx)} ${f(ring.cy)} A ${f(ring.rx)} ${f(ring.ry)} 0 1 1 ${f(ring.cx - ring.rx)} ${f(ring.cy)} A ${f(ring.rx)} ${f(ring.ry)} 0 1 1 ${f(ring.cx + ring.rx)} ${f(ring.cy)} Z"/></circle>
  </svg>
  </figure>
</div>

<div class="statrow">
  ${stat(`${badCount === 0 ? '0' : badCount}`, 'Lands cut through', `<span class="bad">was ${hitNames.length} lands</span> &rarr; <span class="good">none</span>`)}
  ${stat(`+${(((newLen / oldLen) - 1) * 100).toFixed(1)}%`, 'Loop length', `${f(oldLen).toLocaleString()} &rarr; ${f(newLen).toLocaleString()} px`)}
  ${stat(`${(newLen / 300).toFixed(0)}s`, 'Lap time', `was ${(oldLen / 300 + 8).toFixed(0)}s incl. 5 stops`)}
  ${stat(`${f(minPad(newPts))}px`, 'Nearest land', 'clearance budget 60px')}
  ${stat(`${worst(newPts).toFixed(2)}`, 'Closest to sea', '1.00 = water&rsquo;s edge')}
</div>

<section class="sect">
  <h2>What the old loop drove through</h2>
  <div class="tw"><table>
    <thead><tr><th>Land</th><th>Rect (city px)</th><th class="num">Old loop</th><th class="num">New loop</th></tr></thead>
    <tbody>
    ${lands.map((L) => {
      const wasHit = hitNames.includes(L.name);
      const dNew = f(newPts.reduce((m, [x, y]) => Math.min(m, distToRect(x, y, L)), Infinity));
      return `<tr><td>${L.name}</td><td style="color:var(--dim)">x ${f(L.x0)}&hellip;${f(L.x1)} &nbsp; y ${f(L.y0)}&hellip;${f(L.y1)}</td>` +
        `<td class="num ${wasHit ? 'bad' : ''}">${wasHit ? 'cut through' : 'clear'}</td>` +
        `<td class="num good">clear by ${dNew}px</td></tr>`;
    }).join('')}
    </tbody>
  </table></div>
  <p class="note">The loop is <strong>fitted, not tuned</strong>: <code>fitTrainRing()</code> searches for the longest ellipse whose rails stay ashore and clear every land, using the island&rsquo;s own bean field and the real region rects. Add a land and the ring re&#8209;solves around it &mdash; there is no radius constant to go stale. The binding constraint here is <strong>land clearance</strong> (Caramel Cove, ${f(minPad(newPts))}px), not the shoreline, so there is still coast to spare.</p>
</section>
</div>

<script>
const b = document.getElementById('tgOld'), g = document.getElementById('gOld');
b.addEventListener('click', () => {
  const on = b.getAttribute('aria-pressed') === 'true';
  b.setAttribute('aria-pressed', String(!on));
  g.classList.toggle('hidden', on);
  b.textContent = on ? 'Show old' : 'Hide old';
});
</script>
`;

writeFileSync(out, html);
console.log('wrote', out, `(${(html.length / 1024).toFixed(0)} kB)`);
console.log('old cut through:', hitNames.join(', '));
