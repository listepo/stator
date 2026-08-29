// @mode: ts
// @verdict: dynamic
// SUBSET.md: Set with object elements

const s = new Set<object>();
s.add({ id: 1 });
console.log(s.size);
