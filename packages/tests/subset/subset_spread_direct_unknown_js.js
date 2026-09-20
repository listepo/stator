// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Spread operator ... in array literals (plan.md §8 step 2a(c) wake)
// A directly-`unknown` spread operand used to die as the checker's TS2488; js mode now
// suppresses that code for `for-of`'s GetIterator dispatch, so the spread reaches the gate,
// which stays silent (no double report), and the lowering refuses it with the same precise
// STA1214 every other unknown spread carries -- spread-of-unknown is step 12(c) residue with
// its own card, not the dispatch's second caller. The ts twin keeps STA0012.
/** @param {unknown} u */
function f(u) {
  return [...u];
}
console.log(f([1, 2]));
