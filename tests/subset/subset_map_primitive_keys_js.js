// @mode: js
// @verdict: dynamic
// SUBSET.md: Map with primitive keys (string, number, boolean, null, undefined)

const m = new Map();
m.set('key', 42);
console.log(m.get('key'));
