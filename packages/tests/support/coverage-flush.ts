import { takeCoverage } from 'node:v8';
import { afterAll } from 'vitest';

// Under `c8` every process inherits NODE_V8_COVERAGE, but vitest ends its workers before V8's
// exit-time dump runs; flushing here is what keeps in-worker code in the report.
afterAll(() => {
  if (process.env['NODE_V8_COVERAGE'] !== undefined) takeCoverage();
});
