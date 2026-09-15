// Boundary widening on the declaration and assignment edges (plan.md §8 step 45):
// a dynamic value reaching a fixed-shape binding widens it to Unknown, so every
// later read goes through the shape table instead of loading a slot out of a
// shape-table value (silent `2e-323` garbage). The ts-mode twin is
// `ts/decl_assign_boundary.ts`, spelled with annotations rather than JSDoc.

/** @type {{a: number}} */
const x = JSON.parse('{"a":1}');
console.log(x.a);

/** @type {{a: number}} */
let o = { a: 0 };
console.log(o.a);
o = JSON.parse('{"a":2}');
console.log(o.a);

// A nullish mismatch throws Node's catchable TypeError off the dynamic read,
// for both the declaration and the reassignment edges.
/** @type {{a: number}} */
const bad = JSON.parse('null');
try {
  console.log(bad.a);
} catch (e) {
  console.log(e.name);
}
/** @type {{a: number}} */
let o2 = { a: 0 };
o2 = JSON.parse('null');
try {
  console.log(o2.a);
} catch (e) {
  console.log(e.name);
}

// Nested shapes widen once at the binding; chained reads stay dynamic.
/** @type {{a: {b: number}}} */
const n = JSON.parse('{"a":{"b":7}}');
console.log(n.a.b);
/** @type {{a: {b: number}}} */
let m = { a: { b: 0 } };
m = JSON.parse('{"a":{"b":8}}');
console.log(m.a.b);
