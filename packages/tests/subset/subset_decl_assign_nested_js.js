// @mode: js
// @verdict: dynamic
// SUBSET.md: Declarations, mixed-graph boundaries
// A nested shape widens once at the binding; chained reads stay dynamic
// (plan.md §8 step 45). ts mode keeps the checker's own refusal
// (subset_decl_assign_nested_ts).
/** @type {{a: {b: number}}} */
const n = JSON.parse('{"a":{"b":7}}');
console.log(n.a.b);
