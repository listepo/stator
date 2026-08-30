// @mode: js
// @verdict: dynamic
// SUBSET.md: Map, Set

const m = new Map();
m.set('a', 1);
m.forEach((v, k) => {
  console.log(`${k}=${v}`);
});

const s = new Set();
s.add(1);
s.forEach((v) => {
  console.log(v);
});
