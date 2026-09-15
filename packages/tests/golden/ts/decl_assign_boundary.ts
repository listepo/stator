// Boundary widening on the declaration and assignment edges (plan.md §8 step 45):
// a dynamic value reaching a fixed-shape binding widens it to Unknown, so every
// later read goes through the shape table instead of loading a slot out of a
// shape-table value (silent `2e-323` garbage). The js-mode twin is
// `js/decl_assign_boundary.js`, spelled with JSDoc rather than annotations.

const x: { a: number } = JSON.parse('{"a":1}');
console.log(x.a);

let o: { a: number } = { a: 0 };
console.log(o.a);
o = JSON.parse('{"a":2}');
console.log(o.a);

// A nullish mismatch throws Node's catchable TypeError off the dynamic read,
// for both the declaration and the reassignment edges.
const bad: { a: number } = JSON.parse('null');
try {
  console.log(bad.a);
} catch (e) {
  console.log((e as unknown as { name: string }).name);
}
let o2: { a: number } = { a: 0 };
o2 = JSON.parse('null');
try {
  console.log(o2.a);
} catch (e) {
  console.log((e as unknown as { name: string }).name);
}

// Nested shapes widen once at the binding; chained reads stay dynamic.
const n: { a: { b: number } } = JSON.parse('{"a":{"b":7}}');
console.log(n.a.b);
let m: { a: { b: number } } = { a: { b: 0 } };
m = JSON.parse('{"a":{"b":8}}');
console.log(m.a.b);
