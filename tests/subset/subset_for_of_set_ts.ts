// @mode: ts
// @verdict: static
// SUBSET.md: for-of over a Set (Phase 5 step 8 specialized loop)

const s = new Set<string>();
s.add('ab');
let n: number = 0;
for (const e of s) {
  n += e.length;
}
console.log(n);
