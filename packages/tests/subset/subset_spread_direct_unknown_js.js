// @mode: js
// @verdict: dynamic
// SUBSET.md: Spread operator ... in array literals (plan.md §8 step 2a(c) wake)
// A directly-`unknown` spread operand used to die as the checker's TS2488; js mode suppresses
// that code for `for-of`'s GetIterator dispatch, and the spread now drains the operand at run
// time through the `...` row (plan.md §11c T11.4 step 5). The ts twin keeps STA0012.
/** @param {unknown} u */
function f(u) {
  return [...u];
}
console.log(f([1, 2]));
