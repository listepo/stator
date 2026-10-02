// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment to a function declaration's binding
// A function declaration's binding is mutable (§10.2.11), and a compiled namespace IIFE
// publishes its object through it -- the shape TypeScript's own `_tsc.js` emits, where tsc's
// checkJs refused it as TS2630 (plan-notes 297). js mode drops that code and widens the binding,
// so its slot holds the function and then whatever replaces it. The ts twin keeps STA0012.
var Debug = {};
function log() {}
(function (log2) {
  log2.level = 3;
})(log = Debug.log || (Debug.log = {}));
console.log(Debug.log.level, typeof log);
