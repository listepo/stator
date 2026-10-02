// @mode: ts
// @verdict: static
// SUBSET.md: Global functions
// `Array.from(x)` over a typed iterable keeps the checker's element type (plan.md §11c T11.4
// step 5).
const s = new Set<number>();
s.add(1);
s.add(2);
const xs: number[] = Array.from(s);
console.log(xs, Array.from('hé'));
