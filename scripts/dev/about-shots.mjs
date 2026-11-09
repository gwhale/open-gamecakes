#!/usr/bin/env node
// Photographs the town for /about, with every menu hidden: just the world, full frame.
//
//   npx next dev   (in another terminal, output redirected to a file)
//   TOWN_LOGIN=... TOWN_PASSWORD=... node scripts/dev/about-shots.mjs [--base http://localhost:3000]
//
// Writes public/about/<name>.jpg. Same rules as town-shots.mjs: a demo kid, every
// non-GET /api/ request refused, every land opened only in the page.
//
// ⚠️ Some lands carry a real kid's name on their sign, and check:names cannot read
// pixels. Copy regions.local.template.ts over regions.local.ts for the run, so those
// lands do not exist, restore it after, and look at every picture before committing.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIEWPORT = { width: 1400, height: 875 };

// Each view stands the cupcake somewhere and points the camera. `look` is yaw.
const SHOTS = [
  { name: 'island', region: 'caramel-cove', camera: { mode: 'drone', zoom: 3.4 } },
  { name: 'cartridges', game: 'pacman-cakey', camera: { mode: 'chase', zoom: 1.5, yaw: 0 } },
  { name: 'puzzle-island', region: 'puzzle-isle', camera: { mode: 'chase', zoom: 3, yaw: 0.5 } },
];

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3000' },
    settle: { type: 'string', default: '12000' },
    only: { type: 'string' },
  },
});
const { TOWN_LOGIN: login, TOWN_PASSWORD: password } = process.env;
if (!login || !password) {
  console.error('usage: TOWN_LOGIN=... TOWN_PASSWORD=... node scripts/dev/about-shots.mjs [--base url]');
  process.exit(2);
}
const settleMs = Number(values.settle);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method && listeners.has(msg.method)) listeners.get(msg.method)(msg.params);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  });
  return {
    on: (method, fn) => listeners.set(method, fn),
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
  const out = resolve('public/about');
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'about-shots-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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
      const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    const until = async (expression, what, timeoutMs = 120_000) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression).catch(() => false)) return;
        await sleep(500);
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    const post = (path, fields) =>
      evaluate(`fetch(${JSON.stringify(path)}, { method: 'POST', body: new URLSearchParams(${JSON.stringify(fields)}) }).then((r) => r.status)`);

    await cdp.send('Page.navigate', { url: `${values.base}/login` });
    await until(`document.querySelector('form[action="/api/auth/login"]') !== null`, 'the login form');
    await post('/api/auth/login', { login, password });
    await cdp.send('Page.navigate', { url: `${values.base}/kids` });
    await until(`document.querySelector('form[action="/api/kids/select"] input[name="kidId"]') !== null`, 'a kid without a PIN');
    await post('/api/kids/select', { kidId: await evaluate(`document.querySelector('form[action="/api/kids/select"] input[name="kidId"]').value`) });

    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
      if (request.method === 'GET') cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
      else cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });

    await cdp.send('Page.navigate', { url: `${values.base}/town?gfx=high&perf=1` });
    await until(`!!window.__townDebug && !!document.querySelector('canvas')`, 'the town engine');
    await evaluate('window.__townDebug.revealAll()');
    // The canvas fills the page, over every menu, and the frame readout goes.
    await evaluate(`(() => {
      const box = document.querySelector('canvas').parentElement;
      box.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483000;border:0;padding:0;border-radius:0;margin:0;max-width:none;box-shadow:none';
      document.querySelector('nextjs-portal')?.remove();
      for (const el of box.children) if (el.tagName !== 'CANVAS') el.style.display = 'none';
      window.dispatchEvent(new Event('resize'));
    })()`);
    await sleep(settleMs);

    for (const shot of SHOTS.filter((s) => !values.only || s.name === values.only)) {
      await evaluate(`(() => {
        const d = window.__townDebug;
        const ok = ${shot.game ? `d.goGame(${JSON.stringify(shot.game)})` : `d.goRegion(${JSON.stringify(shot.region)})`};
        if (!ok) throw new Error('no such place: ${shot.name}');
        d.setCamera({ yaw: 0, zoom: 1.5, ...${JSON.stringify(shot.camera)} });
        d.setWeather('sunny');
      })()`);
      await sleep(settleMs);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      writeFileSync(join(out, `${shot.name}.jpg`), Buffer.from(data, 'base64'));
      console.log(`wrote ${shot.name}.jpg`);
    }
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
