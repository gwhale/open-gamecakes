// Module-resolution hook so build scripts can import the app's real TypeScript
// instead of re-implementing or regex-scraping it.
//
// Node's type stripping runs TS directly, but it will not do the two things the
// app's bundler does for free:
//   1. the `@/` -> src/ path alias from tsconfig
//   2. extensionless relative imports ('./regions')
//
// Without this, a script can only import modules whose every import is
// `import type` (erased). cakey-lines.ts qualifies; story-events.ts does not,
// because it genuinely calls findRegion() at runtime.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs script.mjs

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      const ROOT = ${JSON.stringify(pathToFileURL(process.cwd() + '/').href)};
      const hasExt = (s) => /\.[cm]?[jt]sx?$/.test(s);
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith('@/')) {
          return next(new URL('src/' + specifier.slice(2) + '.ts', ROOT).href, context);
        }
        if (specifier.startsWith('.') && !hasExt(specifier)) {
          try { return await next(specifier + '.ts', context); } catch { /* fall through */ }
        }
        return next(specifier, context);
      }
    `),
  import.meta.url,
);
