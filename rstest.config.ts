import { defineConfig } from '@rstest/core';
export default defineConfig({
  include: ['packages/tests/unit/*.test.ts'],
  testTimeout: 0,
  testEnvironment: 'node',
  setupFiles: ['packages/tests/support/coverage-flush.ts'],
  output: { externals: [/^@opentelemetry\//] },
});
