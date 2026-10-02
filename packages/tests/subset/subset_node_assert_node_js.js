// @mode: js
// @verdict: dynamic
// @node: true
// SUBSET.md: node:assert under --node — the bare specifier and the default export.

import assert from 'assert';

assert.deepStrictEqual({ a: [1] }, { a: [1] });
console.log('ok');
