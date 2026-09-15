// @mode: js
// @verdict: dynamic
// SUBSET.md: dynamic lowering / plan.md §8 step 45
// An untyped receiver's method resolves through the fixed-shape method table at run time
// (hidden `#method:` slots for object literals, descriptor tables for classes) instead of
// missing to `undefined` -- proved by tests/golden/js/dynamic_method_dispatch.js.

function callM(o) {
  return o.m();
}
console.log(callM({ m() { return 1; } }));
