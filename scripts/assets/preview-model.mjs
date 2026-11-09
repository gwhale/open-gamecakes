/**
 * Render authored GLBs the way the town shows them.
 *
 *   npm run preview:model                                   # every GLB under public/models/
 *   npm run preview:model -- public/models/town/cakey.glb   # just these
 *
 * Writes art/look/<name>.png: four turntable angles at rest, then one tile per
 * animation clip. It uses three's GLTFLoader and the town's own light rig
 * (src/lib/town/three/lighting.ts), so tone mapping and lighting match the
 * game. Blender's Cycles preview is a geometry check; this is the look check.
 *
 * Needs Chrome. Set CHROME=<path> if it is not in the usual place. Rendering is
 * software GL (SwiftShader), so it works headless on any machine.
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';

const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'art', 'look');
const TILE = 320;

const CHROME =
  process.env.CHROME ??
  {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }[process.platform] ??
  'google-chrome';

async function listGlbs(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.glb'))
    .map((e) => path.join(e.parentPath, e.name));
}

async function bundle(tmp) {
  await build({
    configFile: false,
    logLevel: 'warn',
    root: REPO,
    build: {
      outDir: tmp,
      emptyOutDir: false,
      lib: { entry: path.join(REPO, 'scripts/assets/preview/look.ts'), formats: ['es'], fileName: () => 'look.js' },
    },
  });
  await writeFile(
    path.join(tmp, 'index.html'),
    '<!doctype html><meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/look.js"></script>',
  );
}

function serve(tmp) {
  const server = http.createServer(async (req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Models come straight from public/, everything else from the bundle.
    const file = u.startsWith('/models/')
      ? path.join(REPO, 'public', u)
      : path.join(tmp, u === '/' ? 'index.html' : u);
    try {
      const body = await readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' }[path.extname(file)];
      res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openChrome(profile) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${profile}`,
    'about:blank',
  ]);
  let target;
  for (let i = 0; i < 75 && !target; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {
      // not listening yet
    }
  }
  if (!target) throw new Error(`Chrome did not start (${CHROME}); set CHROME=<path>`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    pending.get(m.id)?.(m);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { send, close: () => (ws.close(), proc.kill()) };
}

async function shoot(cdp, origin, glb) {
  const rel = path.relative(path.join(REPO, 'public'), glb).split(path.sep).join('/');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: TILE * 12, height: TILE, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: `${origin}/?glb=/${encodeURI(rel)}` });
  let look;
  for (let i = 0; i < 240 && !look?.done; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__look', returnByValue: true });
    look = r.result?.result?.value;
  }
  if (!look?.done) throw new Error('timed out rendering');
  if (look.error) throw new Error(look.error);
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: TILE * look.tiles, height: TILE, scale: 1 },
  });
  const out = path.join(OUT_DIR, `${path.basename(glb, '.glb')}.png`);
  await writeFile(out, Buffer.from(shot.result.data, 'base64'));
  return { out, info: look.info };
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => path.resolve(p))
  : (await listGlbs(path.join(REPO, 'public', 'models'))).sort();

const tmp = await mkdtemp(path.join(os.tmpdir(), 'gamecakes-look-'));
await mkdir(OUT_DIR, { recursive: true });
await bundle(tmp);
const server = await serve(tmp);
const cdp = await openChrome(path.join(tmp, 'profile'));
let failed = 0;
try {
  for (const glb of targets) {
    try {
      const { out, info } = await shoot(cdp, `http://127.0.0.1:${server.address().port}`, glb);
      console.log(`ok   ${path.relative(REPO, out)}  [${info}]`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${path.relative(REPO, glb)}: ${e instanceof Error ? e.message : e}`);
    }
  }
} finally {
  cdp.close();
  server.close();
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
process.exit(failed ? 1 : 0);
