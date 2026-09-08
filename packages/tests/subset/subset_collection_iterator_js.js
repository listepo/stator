// @mode: js
// @verdict: dynamic
// SUBSET.md: Map, Set
// `keys`/`values`/`entries` as a for-of operand inline the specialized walk (plan-notes 150).
// The Set is untyped, so the file is dynamic. Do not log the iterator object.

const s = new Set();
s.add(1);
let n = 0;
for (const v of s.values()) {
  n += v;
}
console.log(n);
