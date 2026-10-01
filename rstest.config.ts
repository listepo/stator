import { defineConfig } from '@rstest/core';
export default defineConfig({
  include: ['packages/tests/unit/*.test.ts'],
  testTimeout: 0,
  testEnvironment: 'node',
  output: { externals: [/^@opentelemetry\//] },
});
