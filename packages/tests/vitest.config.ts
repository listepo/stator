import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests only. Subset, golden, leak and ASan stay plain `node` harnesses (plan-notes 285).
export default defineConfig({
  test: {
    // Repo root, so `include` and `--changed`'s git diff resolve from one place.
    root: fileURLToPath(new URL('../..', import.meta.url)),
    include: ['packages/tests/unit/*.test.ts'],
    // Native `import` (Node type stripping), not Vite's transform: unit tests run exactly the code
    // the CLI runs, and `c8` reads V8 coverage without a source-map hop.
    experimental: { viteModuleRunner: false },
    setupFiles: ['packages/tests/support/coverage-flush.ts'],
    // node:test had no per-test timeout; native compile-and-run proofs take seconds each.
    testTimeout: 0,
    // `--changed` walks the TS import graph. The C runtime is outside it, yet the native proofs
    // link `libjsrt.a`, so a runtime change reruns everything.
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      '**/packages/runtime/src/**',
      '**/packages/runtime/include/**',
    ],
  },
});
