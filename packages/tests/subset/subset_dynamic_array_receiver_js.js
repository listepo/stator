// @mode: js
// @verdict: dynamic
// SUBSET.md: var declarations, hoisting / plan.md §8 step 20
// A method on a hoisted `var` reads `undefined` until the declaration runs. The call lowers
// through the receiver the checker inferred, and the runtime throws a catchable TypeError
// (STA2008) instead of segfaulting -- proved by tests/golden/js/dynamic_array_receiver.js.

function add(v) {
  arr.push(v);
}
add(1);
var arr = [];
