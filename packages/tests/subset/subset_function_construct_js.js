// @mode: js
// @verdict: dynamic
// SUBSET.md: `new` on an ordinary function

// An ordinary function is a constructor: `new P(1)` builds a dynamic object whose prototype is
// `P.prototype` and runs `P` with it as `this` (plan-notes 310, docs/VALUE.md §4.17).
function P(x) {
  this.x = x;
}
const p = new P(1);
console.log(p.x, p instanceof P);
