// @mode: ts
// @verdict: static
// SUBSET.md: Set with primitive elements

// The type argument is on the construction: an annotation alone leaves the call `Set<any>`.
const s = new Set<string>();
s.add('a');
console.log(s.has('a'));
