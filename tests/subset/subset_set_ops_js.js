// @mode: js
// @verdict: dynamic
// SUBSET.md: Set
// The same operations on untyped Sets. The elements are Unknown, which changes nothing here: the
// operations compare with SameValueZero, which needs no type.

const a = new Set();
a.add(1);
a.add('two');
const b = new Set();
b.add('two');
b.add(3);

console.log(a.union(b));
console.log(a.intersection(b));
console.log(a.isDisjointFrom(b));
