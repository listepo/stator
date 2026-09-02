// @mode: js
// @verdict: dynamic
// SUBSET.md: for-of over a Set (Phase 5 step 8 specialized loop)

const s = new Set();
s.add('ab');
let n = 0;
for (const e of s) {
  n += e.length;
}
console.log(n);
