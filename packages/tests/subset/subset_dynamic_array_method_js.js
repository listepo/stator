// @mode: js
// @verdict: dynamic
// SUBSET.md: dynamic lowering / plan.md §8 step 20
// An untyped receiver's method resolves through Array.prototype at run time instead of
// aborting STA2006 where Node runs -- proved by tests/golden/js/dynamic_array_method.js.

function pushIt(a) {
  a.push(9);
  return a.length;
}
console.log(pushIt([1, 2]));
