// The ES2025 set operations in ts mode. The interesting typing fact is that these are the only
// collection operations whose ARGUMENT is another collection: the checker types the result from
// both sides (`union` of two `Set<number>`s is a `Set<number>`), and the runtime reads the argument
// as a table, which is why the gate accepts a real Set and nothing else.

const a = new Set<number>();
a.add(1);
a.add(2);
a.add(3);
const b = new Set<number>();
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
const big = new Set<number>();
big.add(9);
big.add(8);
big.add(7);
big.add(6);
big.add(5);
const small = new Set<number>();
small.add(5);
small.add(6);
console.log(big.intersection(small));
console.log(small.intersection(big));
// Equal sizes take the receiver's order: the walk runs on the receiver while it is no LARGER.
const two = new Set<number>();
two.add(2);
two.add(1);
console.log(two.intersection(a));

// The three predicates, which answer a boolean rather than a collection.
const subset: boolean = two.isSubsetOf(a);
console.log(subset);
console.log(a.isSubsetOf(b));
console.log(a.isSupersetOf(two));
console.log(a.isSupersetOf(b));
const far = new Set<number>();
far.add(97);
console.log(a.isDisjointFrom(far));
console.log(a.isDisjointFrom(b));
console.log(far.isDisjointFrom(a));

// An empty operand on either side, and a set against itself.
const empty = new Set<number>();
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
const weird = new Set<number>();
weird.add(0 / 0);
weird.add(-0);
const plain = new Set<number>();
plain.add(0 / 0);
plain.add(0);
console.log(weird.intersection(plain));
console.log(weird.difference(plain));
console.log(weird.isSubsetOf(plain));

// Strings compare by content.
const words = new Set<string>();
words.add('a');
words.add('b');
const more = new Set<string>();
more.add('b');
more.add('c');
console.log(words.union(more));
console.log(words.intersection(more));
console.log(words.symmetricDifference(more));

// The result is an ordinary Set, so it feeds a typed binding, answers `size` and `has`, walks with
// forEach, and is itself an operand.
const combined: Set<number> = a.union(b);
console.log(combined.size);
console.log(combined.has(4));
combined.forEach((v: number): void => {
  console.log(v);
});
console.log(a.union(b).intersection(b).difference(two));
