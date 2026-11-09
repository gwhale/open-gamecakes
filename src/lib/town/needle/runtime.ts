import type { NeedleRuntimeModule } from '@/lib/town/needle/components/GameDome';

/**
 * Loads Needle's prebuilt browser runtime, self-hosted under /needle/runtime/.
 *
 * Why not just `import '@needle-tools/engine'` and let Next bundle it?
 * Because it does not build. `@needle-tools/materialx` (a transitive dependency
 * pulled in eagerly by engine_modules.js) resolves its wasm payload with
 * `fileURLToPath(new URL(binDirectory + fileName, import.meta.url))` — a Node
 * API plus a dynamic URL that Turbopack cannot statically resolve:
 *
 *   Module not found: Can't resolve <dynamic>
 *   ./node_modules/@needle-tools/materialx/src/materialx.js:32:37
 *
 * Needle's prebuilt runtime has already resolved all of that for the browser,
 * which is why we serve it as a static asset instead. This is NOT Needle's Next
 * plugin — that one forces static export and a `dist` output dir, which would
 * break the app's dynamic API routes.
 *
 * The `webpackIgnore` magic comment is load-bearing: without it the bundler
 * resolves this specifier at build time and drags the whole package back into
 * the graph, reproducing exactly the failure above. It is honoured by both
 * webpack and Turbopack (see next/dist/docs .../08-turbopack.md), so the import
 * stays in the output verbatim and is a genuine runtime fetch of a static file.
 */
const RUNTIME_URL = '/needle/runtime/needle-engine.min.js';
const REGISTRATION_TIMEOUT_MS = 10_000;

let runtimePromise: Promise<NeedleRuntimeModule> | null = null;

/**
 * Resolves to the single engine module instance backing <needle-engine>.
 * Cached, so repeated mounts share one instance and one TypeStore.
 */
export function loadNeedleRuntime(): Promise<NeedleRuntimeModule> {
  runtimePromise ??= (async () => {
    const engine = (await import(/* webpackIgnore: true */ RUNTIME_URL)) as NeedleRuntimeModule;

    // Importing the module registers the web component as a side effect, but
    // registration is async — wait for it rather than racing the first render.
    await Promise.race([
      customElements.whenDefined('needle-engine'),
      new Promise<never>((_resolve, reject) => {
        window.setTimeout(
          () => reject(new Error('Needle web component registration timed out.')),
          REGISTRATION_TIMEOUT_MS,
        );
      }),
    ]);

    return engine;
  })().catch((error: unknown) => {
    // Don't cache a failed load — a retry (or the fallback redirect) should be
    // able to try again from scratch.
    runtimePromise = null;
    throw error;
  });

  return runtimePromise;
}
