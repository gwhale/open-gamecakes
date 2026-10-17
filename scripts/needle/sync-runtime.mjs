/**
 * Copies Needle's prebuilt browser runtime from node_modules into
 * public/needle/runtime/ so it can be served as a static asset.
 *
 * Two things this script is careful about:
 *
 * 1. It must never break a build that does not want Needle. The engine is an
 *    alpha dependency behind an off-by-default flag; if it is absent, pruned, or
 *    the alpha version is unpublished, this exits cleanly instead of failing the
 *    production build for gamecakes.org.
 *
 * 2. It copies only what the browser actually loads. `dist/` ships every module
 *    in three formats (.js, .min.js, .umd.cjs) plus type declarations — 75 MB,
 *    of which ~28 MB is MaterialX alone. We walk the real module graph from the
 *    minified entry and copy the transitive closure, which is a few MB. Walking
 *    the graph (rather than globbing *.min.js) keeps this correct when Needle
 *    re-hashes its chunk filenames, and keeps workers — which ship only as
 *    unminified .js — from being dropped.
 */
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ENTRY = 'needle-engine.min.js';
const packagePath = path.resolve('node_modules/@needle-tools/engine/package.json');
const target = path.resolve('public/needle/runtime');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(packagePath))) {
  console.log('Needle engine not installed — skipping runtime sync.');
  process.exit(0);
}

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const sourceDist = path.join(path.dirname(packagePath), 'dist');

if (!(await exists(path.join(sourceDist, ENTRY)))) {
  console.log(`Needle dist/${ENTRY} not found — skipping runtime sync.`);
  process.exit(0);
}

// Matches both static/dynamic import specifiers and `new URL("./worker.js",
// import.meta.url)` worker references, which is how the bundles reach workers.
const RELATIVE_SPECIFIER = /["'](\.\/[^"']+\.(?:js|cjs|wasm|data|txt))["']/g;

const queue = [ENTRY];
const needed = new Set();

while (queue.length > 0) {
  const file = queue.pop();
  if (needed.has(file)) continue;
  const absolute = path.join(sourceDist, file);
  if (!(await exists(absolute))) continue;
  needed.add(file);

  // Only text modules can reference further modules.
  if (!/\.(js|cjs)$/.test(file)) continue;
  const contents = await readFile(absolute, 'utf8');
  for (const match of contents.matchAll(RELATIVE_SPECIFIER)) {
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), match[1]),
    );
    if (!needed.has(resolved)) queue.push(resolved);
  }
}

// Non-JS siblings (wasm/data payloads) are fetched by URL at runtime rather than
// imported, so pull in anything the graph did not name but that sits alongside a
// file we already need and is not a duplicate build format.
const allFiles = await readdir(sourceDist);
for (const file of allFiles) {
  if (/\.(wasm|bin)$/.test(file)) needed.add(file);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

let bytes = 0;
for (const file of needed) {
  const from = path.join(sourceDist, file);
  const to = path.join(target, file);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
  bytes += (await stat(from)).size;
}

await writeFile(
  path.join(target, 'runtime.json'),
  `${JSON.stringify(
    {
      engineVersion: packageJson.version,
      source: '@needle-tools/engine/dist',
      entry: ENTRY,
      files: [...needed].sort(),
      generated: true,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Synced Needle ${packageJson.version} runtime: ${needed.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (from ${allFiles.length} in dist).`,
);
