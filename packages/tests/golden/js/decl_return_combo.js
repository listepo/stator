// The decl×return combination (plan.md §8 step 46): a widened call flowing into a
// fixed-annotated declaration. Step 45 widened the CALL and the BINDING in two blind
// passes, so `const y = f()` with a widened `f()` read garbage (`2e-323`); one joint
// fixpoint now widens `y` too, and every read below routes through the shape table.
// The ts-mode twin is `ts/decl_return_combo.ts`, spelled with annotations.

// Direct combo.
/** @returns {{x: number}} */
function f() { return JSON.parse('{"x":1}'); }
/** @type {{x: number}} */
const y = f();
console.log(y.x);

// Chained: `z` widens through the widened `y`.
/** @type {{x: number}} */
const z = y;
console.log(z.x);

// Reassignment of combo: the binding widens once, so the pre-reassignment read is
// dynamic too — and still answers, off either representation.
/** @type {{x: number}} */
let w = { x: 0 };
console.log(w.x);
w = f();
console.log(w.x);

// A nullish mismatch throws Node's catchable TypeError off the dynamic read.
/** @returns {{x: number}} */
function nil() { return JSON.parse('null'); }
/** @type {{x: number}} */
const bad = nil();
try {
  console.log(bad.x);
} catch (e) {
  console.log(e.name);
}
