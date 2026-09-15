// A dynamic value RETURNED where a fixed object/array type is declared widens the CALL,
// not the declaration (plan.md §8 step 45): the declared return type is an overload and
// vtable contract, so the declaration keeps its shape and every call result answers Unknown,
// routing uses through the shape table instead of loading slots out of a shape-table value
// (silent `2e-323` garbage). The ts-mode twin is `ts/return_boundary.ts`, spelled with
// annotations rather than JSDoc.

/** @returns {{x: number}} */
function f() { return JSON.parse('{"x":1}'); }
console.log(f().x);

// Reordered keys: the static layout's slot order is the annotation's, the value's is the
// source text's — only a name-resolved read answers correctly.
/** @returns {{x: number, y: number}} */
function reordered() { return JSON.parse('{"y":1,"x":2}'); }
console.log(reordered().x);
console.log(reordered().y);

// Arrays share the representation, so direct reads already worked — but the element path
// through for-of binds the declared object type, which miscompiled the same way.
/** @returns {number[]} */
function nums() { return JSON.parse('[1,2,3]'); }
console.log(nums()[0]);
console.log(nums().length);
console.log(nums().join("|"));
/** @returns {{x: number, y: number}[]} */
function objs() { return JSON.parse('[{"y":1,"x":2},{"y":3,"x":4}]'); }
for (const o of objs()) { console.log(o.x); }
console.log(objs().length);

// A nullish mismatch throws Node's catchable TypeError off the dynamic read.
/** @returns {{x: number}} */
function nil() { return JSON.parse('null'); }
try {
  console.log(nil().x);
} catch (e) {
  console.log("threw " + e.name);
}

// Nested calls mark to a fixpoint: h marks once g is marked, g once f is.
/** @returns {{x: number}} */
function g() { return f(); }
/** @returns {{x: number}} */
function h() { return g(); }
console.log(h().x);
console.log(g().x);

// A statically slot-exact return keeps its slots: no widening, no dynamic read.
function clean() { return { x: 41 }; }
console.log(clean().x);

// An arrow assigned to a variable marks under the variable's name, the only name its
// callers resolve through.
const af = () => JSON.parse('{"x":7}');
console.log(af().x);

// Recursion terminates the marking walk: the self-call reads the declared type until a
// mark exists, so it never marks alone.
function rec(n) {
  if (n <= 0) { return JSON.parse('{"x":99}'); }
  return rec(n - 1);
}
console.log(rec(3).x);

// A clean class return keeps its layout and its dispatch: the mark only fires on evidence.
class C {
  constructor() { this.x = 3; }
  getX() { return this.x; }
}
/** @returns {C} */
function makeC() { return new C(); }
console.log(makeC().x);
console.log(makeC().getX());
