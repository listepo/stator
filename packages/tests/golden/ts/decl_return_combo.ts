// The decl×return combination (plan.md §8 step 46): a widened call flowing into a
// fixed-annotated declaration. Step 45 widened the CALL and the BINDING in two blind
// passes, so `const y: Fixed = f()` with a widened `f()` read garbage (`2e-323`); one
// joint fixpoint now widens `y` too, and every read below routes through the shape
// table. The js-mode twin is `js/decl_return_combo.js`, spelled with JSDoc.

// Direct combo.
function f(): { x: number } { return JSON.parse('{"x":1}'); }
const y: { x: number } = f();
console.log(y.x);

// Chained: `z` widens through the widened `y`.
const z: { x: number } = y;
console.log(z.x);

// Reassignment of combo: the binding widens once, so the pre-reassignment read is
// dynamic too — and still answers, off either representation.
let w: { x: number } = { x: 0 };
console.log(w.x);
w = f();
console.log(w.x);

// A nullish mismatch throws Node's catchable TypeError off the dynamic read.
function nil(): { x: number } { return JSON.parse('null'); }
const bad: { x: number } = nil();
try {
  console.log(bad.x);
} catch (e) {
  console.log((e as unknown as { name: string }).name);
}
