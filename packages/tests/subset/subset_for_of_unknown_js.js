// @mode: js
// @verdict: dynamic
// SUBSET.md: for-of over an unknown iterable (plan.md §8 step 2a(c), TS2488)
// js mode suppresses the checker's refusal and lowers to the runtime GetIterator dispatch:
// collections box into their specialized walk, generators and stored iterators drive as-is,
// a user-iterable method is resolved and called, and anything else throws Node's catchable
// TypeError. The ts twin keeps the refusal (STA0012).
function each(o) {
  for (const x of o) {
    console.log(x);
  }
}
each([10, 20]);
each('ab');
