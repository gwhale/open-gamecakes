// Resolver hook so node can load the app's TypeScript modules directly.
//
//   node --import ./scripts/lw-ts-alias.mjs scripts/some-check.mjs
//
// Node 22.6+ strips types on its own, but it will not resolve two things the
// Next build resolves for us: the `@/` path alias from tsconfig, and
// extensionless relative imports (`./layout` → `./layout.ts`). This adds both,
// which is enough to pull real town geometry into a plain node check script —
// no bundler, no test framework, no WebGL context.
//
// Leaf modules that import NOTHING (bean.ts, race-track.ts, train-track.ts) do
// not need this; they load bare. It is only for checks that want the wired-up
// geometry (train.ts, layout.ts, islands.ts) rather than the pure maths.

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

const resolveFile = (p) => {
  for (const c of [p, `${p}.ts`, `${p}.tsx`, path.join(p, 'index.ts')]) {
    if (existsSync(c)) return c;
  }
  return null;
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const hit = resolveFile(path.join(SRC, specifier.slice(2)));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const hit = resolveFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
