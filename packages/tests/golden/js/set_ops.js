// The ES2025 set operations in js mode. Every operand is built with `add` (constructing from an
// iterable is still deferred), and every result is printed as a Set so the ORDER is on the record:
// it is normative for all four combining forms, and for `intersection` it is not the receiver's.

const a = new Set();
a.add(1);
a.add(2);
a.add(3);
const b = new Set();
b.add(5);
b.add(4);
b.add(3);
b.add(2);

console.log(a.union(b));
console.log(b.union(a));
console.log(a.intersection(b));
console.log(a.difference(b));
console.log(b.difference(a));
console.log(a.symmetricDifference(b));
console.log(b.symmetricDifference(a));

// Neither operand is touched by any of it.
console.log(a);
console.log(b);

// intersection walks the SMALLER collection and answers in ITS order: `big` holds 9,8,7,6,5 and
// `small` holds 5,6, so the answer is 5,6 -- the receiver's order would have been 6,5.
const big = new Set();
big.add(9);
big.add(8);
big.add(7);
big.add(6);
big.add(5);
const small = new Set();
small.add(5);
small.add(6);
console.log(big.intersection(small));
console.log(small.intersection(big));
// The equal-size case takes the receiver's order, since the walk runs on the receiver when it is
// no LARGER than the argument.
const two = new Set();
two.add(2);
two.add(1);
console.log(two.intersection(a));

// The predicates.
console.log(a.isSubsetOf(b));
console.log(two.isSubsetOf(a));
console.log(a.isSupersetOf(two));
console.log(a.isSupersetOf(b));
const far = new Set();
far.add(97);
console.log(a.isDisjointFrom(far));
console.log(a.isDisjointFrom(b));
console.log(far.isDisjointFrom(a));

// An empty operand on either side, and a set against itself.
const empty = new Set();
console.log(a.union(empty));
console.log(empty.union(a));
console.log(a.intersection(empty));
console.log(a.difference(empty));
console.log(empty.difference(a));
console.log(a.symmetricDifference(empty));
console.log(a.union(a));
console.log(a.intersection(a));
console.log(a.difference(a));
console.log(a.symmetricDifference(a));
console.log(empty.isSubsetOf(a));
console.log(a.isSubsetOf(empty));
console.log(empty.isDisjointFrom(empty));
console.log(empty.isSupersetOf(empty));

// SameValueZero decides membership here as everywhere else: NaN finds itself, and a -0 written on
// one side finds the +0 on the other.
const weird = new Set();
weird.add(0 / 0);
weird.add(-0);
const plain = new Set();
plain.add(0 / 0);
plain.add(0);
console.log(weird.intersection(plain));
console.log(weird.difference(plain));
console.log(weird.isSubsetOf(plain));

// Strings compare by content, objects by identity -- so two structurally identical objects are two
// different elements, and neither operation finds one through the other.
const words = new Set();
words.add('a');
words.add('b');
const more = new Set();
more.add('b');
more.add('c');
console.log(words.union(more));
console.log(words.intersection(more));
const shared = { k: 1 };
const objs = new Set();
objs.add(shared);
const twins = new Set();
twins.add({ k: 1 });
twins.add(shared);
console.log(objs.intersection(twins).size);
console.log(objs.isSubsetOf(twins));
console.log(twins.isSubsetOf(objs));

// The result is an ordinary Set: it answers `size` and `has`, walks with forEach, and feeds the
// next operation.
const combined = a.union(b);
console.log(combined.size);
console.log(combined.has(4));
combined.forEach((v) => {
  console.log(v);
});
console.log(a.union(b).intersection(b).difference(two));
