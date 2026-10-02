// @mode: ts
// @verdict: dynamic
// @node: true
// SUBSET.md: node:assert under --node — packages/node's strict TypeScript; dynamic because every
// assertion takes `unknown` values.

import assert, { strictEqual } from 'node:assert';

strictEqual(1 + 1, 2);
assert.ok(true);
console.log('ok');
