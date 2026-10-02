import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Node's own test suite (plan.md §11c T11.7): network-fetched, so never part of `pnpm run test`.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('../../..', import.meta.url)),
    include: ['packages/tests/node-suite/*.test.ts'],
    // Native `import` (Node type stripping), as in the unit config.
    experimental: { viteModuleRunner: false },
    // Each test compiles, links and runs a binary.
    testTimeout: 0,
  },
});
