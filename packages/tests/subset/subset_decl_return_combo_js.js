// @mode: js
// @verdict: dynamic
// SUBSET.md: Declarations, mixed-graph boundaries
// The decl×return combination (plan.md §8 step 46): a widened call flowing into a
// fixed-annotated declaration widens the binding too, so the read goes through the
// shape table. ts mode keeps the checker's own refusal (subset_decl_return_combo_ts).
/** @returns {{a: number}} */
function f() { return JSON.parse('{"a":1}'); }
/** @type {{a: number}} */
const y = f();
console.log(y.a);
