// @mode: js
// @verdict: dynamic
// SUBSET.md: Declarations, mixed-graph boundaries
// A dynamic value reaching an annotated `const` widens the binding to Unknown,
// so the read goes through the shape table (plan.md §8 step 45). ts mode keeps
// the checker's own refusal (subset_decl_assign_decl_ts).
/** @type {{a: number}} */
const x = JSON.parse('{"a":1}');
console.log(x.a);
