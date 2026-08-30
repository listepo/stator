// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Map, Set
// `keys`/`values`/`entries` hand back an ITERATOR, which is the Symbol.iterator protocol the
// subset still has no node for -- the reason `forEach` landed and these did not.

const m = new Map<string, number>();
m.set('a', 1);
console.log(m.keys());
