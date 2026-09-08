// @mode: ts
// @verdict: static
// SUBSET.md: Set
// The ES2025 set operations over two real Sets: four that answer a new Set and three that answer a
// boolean. Order is normative -- `intersection` answers in the SMALLER collection's order.

const a = new Set<number>();
a.add(1);
a.add(2);
const b = new Set<number>();
b.add(2);
b.add(3);

console.log(a.union(b));
console.log(a.intersection(b));
console.log(a.difference(b));
console.log(a.symmetricDifference(b));
console.log(a.isSubsetOf(b));
console.log(a.isSupersetOf(b));
console.log(a.isDisjointFrom(b));
