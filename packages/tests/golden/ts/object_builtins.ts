// Object.keys/values/entries (Task 4.2) over all three receiver layouts: fixed-shape literals,
// class instances (declaration order), and dynamic shapes (insertion order) -- both orders ARE
// the spec enumeration order, because identifier keys never reorder.

const p = { x: 1, y: 2, z: 3 };
console.log(Object.keys(p));
console.log(Object.values(p));
console.log(Object.entries(p));
const q: { a?: number; b?: string } = { a: 7 };
console.log(Object.keys(q));
console.log(Object.values(q));
console.log(Object.entries(q));
class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
const pt = new Point(3, 4);
console.log(Object.keys(pt));
console.log(Object.values(pt));
console.log(Object.entries(pt));
const empty: { w?: number } = {};
console.log(Object.keys(empty));
console.log(Object.entries(empty));
console.log(Object.keys({ s: "str", n: 5, b: true }));
console.log(Object.values({ s: "str", n: 5, b: true }));

// getOwnPropertyNames answers the same list as keys for every object the subset can build:
// both layouts hold only string-keyed, enumerable own properties.
console.log(Object.getOwnPropertyNames(p));
console.log(Object.getOwnPropertyNames(pt));
console.log(Object.getOwnPropertyNames(empty));

// hasOwn asks the shape chain (or the class descriptor) directly -- neither layout has a
// prototype the subset can reach, so "own" needs no second question.
console.log(Object.hasOwn(p, 'x'));
console.log(Object.hasOwn(p, 'nope'));
console.log(Object.hasOwn(pt, 'x'));
console.log(Object.hasOwn(pt, 'toString'));
console.log(Object.hasOwn(empty, 'w'));
const lookup = 'y';
console.log(Object.hasOwn(p, lookup));

// fromEntries builds a dynamic shape: pair order is insertion order, and a duplicate key keeps
// its first position while taking the last value -- exactly what the shape table already does.
const pairs: string[][] = [
  ['one', '1'],
  ['two', '2'],
];
const built: unknown = Object.fromEntries(pairs);
console.log(typeof built);
console.log(JSON.stringify(built));
console.log(JSON.stringify(Object.fromEntries([])));
console.log(
  JSON.stringify(
    Object.fromEntries([
      ['k', '1'],
      ['j', '2'],
      ['k', '3'],
    ]),
  ),
);
// Integer-index property names sort numerically ahead of ordinary string keys, even when the
// entries arrived in another order. This applies to both reflection and JSON serialization.
const indexed = Object.fromEntries([
  ['2', 'two'],
  ['1', 'one'],
  ['x', 'ex'],
]);
console.log(Object.keys(indexed));
console.log(JSON.stringify(indexed));
console.log(indexed);

// `Object.assign(target, source)` in its two-argument form. The TARGET must be a shape the runtime
// can GROW -- an index signature or an optional property, which is what makes lookups go through
// the shape table rather than a slot index fixed at build time -- so an all-required literal is
// refused here by design, not by omission.
const base: Record<string, number> = { a: 1, b: 2 };
const patch: Record<string, number> = { b: 20, c: 30 };
const merged = Object.assign(base, patch);
console.log(JSON.stringify(base));
// The return value IS the target, not a copy: mutating through one name shows through the other.
console.log(merged === base);
console.log(Object.keys(base));

// An overwrite keeps the key's ORIGINAL position; only a genuinely new key appends. `b` was
// second before the merge and is second after it, even though `patch` wrote it last.
const order: Record<string, string> = { x: 'x', y: 'y' };
Object.assign(order, { y: 'Y', z: 'Z' });
console.log(Object.entries(order));

// An empty source changes nothing, and a fixed-shape source is a legal source (only the TARGET
// has to be growable -- reading a fixed shape's keys is what `Object.entries` already does).
const acc: Record<string, number> = {};
Object.assign(acc, {});
console.log(Object.keys(acc).length);
Object.assign(acc, { one: 1 });
console.log(acc);
