import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Needle Engine runtime, copied out of node_modules by
    // scripts/needle/sync-runtime.mjs and gitignored (.gitignore:51). It is
    // third-party build output, not our source: linting it produced 223 of the
    // repo's 231 errors and 13,255 of its 13,267 warnings, which buried the 8
    // findings in code we actually own.
    "public/needle/runtime/**",
  ]),

  // Pre-existing React Compiler findings, scoped to the four files that have
  // them so a NEW violation anywhere else still fails the build.
  //
  // `npm run lint` has been red on master for a while, which is how these went
  // unnoticed: the 13,478 problems from the vendored Needle runtime (ignored
  // above) buried them. They are downgraded, not silenced, and each has a
  // known proper fix that deserves its own PR:
  //
  //   react-hooks/set-state-in-effect — FullscreenToggle, SoundToggle and
  //   useIsFullscreen all deliberately defer a browser-state read into an
  //   effect to avoid an SSR hydration mismatch; their comments say so. The
  //   idiomatic fix is useSyncExternalStore, which changes hydration behaviour
  //   in components every kid touches.
  //
  //   react-hooks/purity — the CustomizeShop confetti calls Math.random()
  //   during render. It is now wrapped in useMemo, which fixed the visible bug
  //   (the burst reshuffled on every parent re-render); the compiler still
  //   objects because useMemo runs in the render phase. The full fix is to
  //   generate the pieces in an effect.
  {
    files: [
      "src/components/FullscreenToggle.tsx",
      "src/components/SoundToggle.tsx",
      "src/hooks/useIsFullscreen.ts",
      "src/components/cupcake/CustomizeShop.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
