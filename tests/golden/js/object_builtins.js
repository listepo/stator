// Object.keys/values/entries in js mode: fixed literals are typed by inference, and the JSDoc
// annotation puts the optional-property literal on the dynamic-shape path, same as ts mode.

const p = { x: 1, y: 2, z: 3 };
console.log(Object.keys(p));
console.log(Object.values(p));
console.log(Object.entries(p));

/** @type {{ a?: number, b?: string }} */
const q = { a: 7 };
console.log(Object.keys(q));
console.log(Object.values(q));
console.log(Object.entries(q));

console.log(Object.getOwnPropertyNames(q));
console.log(Object.hasOwn(q, 'a'));
console.log(Object.hasOwn(q, 'b'));

// js mode can PRINT a dynamic shape, so fromEntries shows its layout rather than its JSON:
// insertion order, Node's key quoting, and last-value-first-position on a duplicate.
console.log(
  Object.fromEntries([
    ['one', 1],
    ['two', '2'],
    ['three', true],
  ]),
);
console.log(Object.fromEntries([]));
console.log(
  Object.fromEntries([
    ['k', 1],
    ['j', 2],
    ['k', 3],
  ]),
);
console.log(
  Object.fromEntries([
    ['a-b', 1],
    ['ok', 2],
  ]),
);
console.log(Object.fromEntries(Object.entries(q)));

// Integer-index property names sort numerically ahead of ordinary string keys, even when the
// entries arrived in another order.
const indexed = Object.fromEntries([
  ['2', 'two'],
  ['1', 'one'],
  ['x', 'ex'],
]);
console.log(Object.keys(indexed));
console.log(JSON.stringify(indexed));
console.log(indexed);
