// @mode: js
// @verdict: dynamic
// SUBSET.md: for-of over a Map (Phase 5 step 8 specialized loop)

const m = new Map();
m.set('a', 1);
let n = 0;
for (const e of m) {
  n += 1;
  console.log(e);
}
console.log(n);
