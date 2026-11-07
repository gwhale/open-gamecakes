#!/usr/bin/env node
// Photographs the 3D town from fixed views, so a graphics change can be compared
// with what came before it. Tests cannot see geometry; this is how you look.
//
//   npx next dev   (in another terminal, output redirected to a file)
//   TOWN_LOGIN=... TOWN_PASSWORD=... node scripts/dev/town-shots.mjs <out-dir> [--tier high|tablet] [--base http://localhost:3000]
//
// It signs in, picks the family's first kid without a PIN, and writes one PNG per
// view plus stats.json. Frame times under software GL mean nothing; draw calls
// and triangles are the numbers worth comparing.
//
// Local dev talks to whatever database .env.local names, and teleporting onto a
// locked land can charge for it. So once the kid is picked, every non-GET request
// to /api/ is refused inside the browser, and lands are opened only in the page.
//
// Use http://localhost, not 127.0.0.1: Next dev blocks its own resources
// cross-origin from 127.0.0.1, and the page then renders with no canvas.
// Software GL also runs the sim slowly, hence the long settles.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIEWPORT = { width: 1180, height: 820 }; // iPad landscape

const VIEWS = [
  { name: 'spawn', region: 'town-square', camera: { mode: 'chase' }, weather: 'sunny' },
  { name: 'shore-sky', region: 'sprinkle-shore', camera: { mode: 'sky', zoom: 3.4 }, weather: 'sunny' },
  { name: 'mountain', region: 'meringue-mountain', camera: { mode: 'drone', zoom: 3.4 }, weather: 'sunny' },
  { name: 'cove', region: 'caramel-cove', camera: { mode: 'drone', zoom: 3.4 }, weather: 'sunny' },
  { name: 'side-island', region: 'puzzle-isle', camera: { mode: 'chase' }, weather: 'sunny' },
  { name: 'horizon', region: 'puzzle-isle', camera: { mode: 'action', zoom: 1, yaw: 3.14 }, weather: 'sunny' },
  { name: 'cartridges', region: 'library-of-lemon', camera: { mode: 'chase', zoom: 1.2, yaw: 3.14 }, weather: 'sunny' },
  { name: 'storm', region: 'town-square', camera: { mode: 'chase', yaw: 2.4 }, weather: 'storm' },
];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tier: { type: 'string', default: 'high' },
    base: { type: 'string', default: 'http://localhost:3000' },
    settle: { type: 'string', default: '9000' },
  },
});
const outDir = positionals[0];
const { TOWN_LOGIN: login, TOWN_PASSWORD: password } = process.env;
if (!outDir || !login || !password) {
  console.error('usage: TOWN_LOGIN=... TOWN_PASSWORD=... node scripts/dev/town-shots.mjs <out-dir> [--tier high|tablet] [--base url]');
  process.exit(2);
}
const settleMs = Number(values.settle);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A minimal Chrome DevTools client over Node's global WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  });
  return {
    on: (method, fn) =>
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        if (msg.method === method) fn(msg.params);
      }),
    send: (method, params = {}) =>
      new Promise((res, rej) => {
        id += 1;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  };
}

async function main() {
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'town-shots-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  try {
    let page;
    for (let i = 0; i < 50 && !page; i += 1) {
      await sleep(200);
      const list = await fetch(`http://localhost:${port}/json`).then((r) => r.json()).catch(() => []);
      page = list.find((t) => t.type === 'page');
    }
    if (!page) throw new Error('Chrome did not open a page');
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });

    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    const until = async (expression, what, timeoutMs = 120_000) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression).catch(() => false)) return;
        await sleep(500);
      }
      const here = await evaluate('location.href + " :: " + document.body.innerText.slice(0, 200)').catch(() => '?');
      throw new Error(`timed out waiting for ${what}; page is ${here}`);
    };
    /** Posts a form from inside the page, so its cookies land on this profile. */
    const post = (path, fields) =>
      evaluate(`fetch(${JSON.stringify(path)}, {
        method: 'POST',
        body: new URLSearchParams(${JSON.stringify(fields)}),
        redirect: 'follow',
      }).then((r) => r.status)`);

    await cdp.send('Page.navigate', { url: `${values.base}/login` });
    await until(`document.querySelector('form[action="/api/auth/login"]') !== null`, 'the login form');
    await post('/api/auth/login', { login, password });
    await cdp.send('Page.navigate', { url: `${values.base}/kids` });
    await until(`document.querySelector('form[action="/api/kids/select"] input[name="kidId"]') !== null`, 'a kid without a PIN');
    const kidId = await evaluate(`document.querySelector('form[action="/api/kids/select"] input[name="kidId"]').value`);
    await post('/api/kids/select', { kidId });

    let refused = 0;
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
      if (request.method === 'GET') {
        cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
        return;
      }
      refused += 1;
      cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });

    await cdp.send('Page.navigate', { url: `${values.base}/town?gfx=${values.tier}&perf=1` });
    await until(`!!window.__townDebug && !!document.querySelector('canvas')`, 'the town engine');
    await until(`!!window.__townDebug.perf()`, 'the first perf reading');
    const overlaps = await evaluate('window.__townDebug.overlaps()');
    console.log(`placed things standing on each other: ${overlaps.length}`, overlaps.length ? JSON.stringify(overlaps) : '');
    await evaluate('window.__townDebug.revealAll()');
    await sleep(settleMs);

    // Walking up to a game has to offer it. A sample from the row, pier and islands.
    await evaluate('window.__townDebug.setWeather("sunny")');
    await sleep(settleMs);
    for (const slug of ['cakey-stacks', 'cakey-crane', 'sharks-minnows', 'sandcastle-siege', 'chess-puzzles', 'hanoi', 'cakey-crane']) {
      await evaluate(`window.__townDebug.goGame(${JSON.stringify(slug)})`);
      await sleep(settleMs / 2);
      const prompt = await evaluate(`[...document.querySelectorAll('button')].map((b) => b.innerText).filter((t) => /play|▶/i.test(t)).join(' | ').replace(/\\s+/g, ' ')`);
      console.log(`prompt at ${slug}: ${prompt || 'NONE'}`);
    }

    const stats = {};
    for (const view of VIEWS) {
      await evaluate(`(() => {
        const d = window.__townDebug;
        if (!d.goRegion(${JSON.stringify(view.region)})) throw new Error('unknown region ${view.region}');
        d.setCamera({ yaw: 0, zoom: 1.5, ...${JSON.stringify(view.camera)} });
        d.setWeather(${JSON.stringify(view.weather)});
      })()`);
      await sleep(settleMs);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(out, `${view.name}.png`), Buffer.from(data, 'base64'));
      stats[view.name] = await evaluate('window.__townDebug.perf()');
      const s = stats[view.name];
      console.log(`${view.name}: ${s.calls} calls, ${(s.triangles / 1000).toFixed(0)}k tris`);
    }
    writeFileSync(join(out, 'stats.json'), `${JSON.stringify({ tier: values.tier, viewport: VIEWPORT, stats }, null, 2)}\n`);
    console.log(`wrote ${VIEWS.length} views to ${out}; refused ${refused} writes`);
  } finally {
    cdp?.close();
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
