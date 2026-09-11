// `delete` in ts mode (plan.md §8 step 2a(c)). The two rules meet here rather than fighting:
// TypeScript refuses `delete` on a required property, and an OPTIONAL property is exactly what
// sends an anonymous shape to the dynamic representation — so every `delete` that type-checks in
// this mode already has a receiver whose keys live in the shape table. The one that survives that
// is a class field, which §1.1 refuses permanently (STA1108, a decision test, not this file).
const o: { a?: number; b?: number; c?: number } = { a: 1, b: 2, c: 3 };
console.log(delete o.a);
console.log(o.a);
console.log('a' in o);
console.log(o);

// Deleting the same key twice is `true` both times — there was nothing left to remove.
console.log(delete o.a);

// The rebuilt shape keeps the surviving keys in insertion order, and a re-added key goes last.
const key = 'b';
console.log(delete o[key]);
o.a = 10;
console.log(o);
console.log(o.c);
