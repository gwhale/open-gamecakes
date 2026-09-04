import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const engineVersion = packageJson.dependencies?.['@needle-tools/engine'] ?? '';
const threeVersion = packageJson.dependencies?.three ?? '';
const failures = [];

if (/alpha|beta|canary|next|experimental/i.test(engineVersion)) {
  failures.push(`Needle Engine is prerelease-only (${engineVersion}).`);
}
if (!threeVersion.startsWith('npm:@needle-tools/three@')) {
  failures.push('The root Three.js dependency is not Needle’s patched build.');
}

if (failures.length) {
  for (const failure of failures) console.error(`Production gate blocked: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Needle production gate passed with engine ${engineVersion}.`);
}
